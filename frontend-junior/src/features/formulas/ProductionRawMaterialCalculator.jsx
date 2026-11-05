import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import useSelectedCompany from '../../hooks/useSelectedCompany'
import PurchaseOrderModal from '../inventory/components/PurchaseOrderModal'
import IssueToProductionModal from './IssueToProductionModal'
import { updateRevision, buildRevisionLinesPayload, searchMaterials } from './formulasService'
import { getMyStores } from '../store/storeService'
import { getAvailableToIssue, createMaterialIssue, postMaterialIssue } from '../store/materialIssueService'
import { controlSamplesService } from '../inventory/controlSamplesService'
import { finishedGoodsService } from '../inventory/finishedGoodsService'
import { getErrorMessage } from '../../utils/errors'
import './ProductionRawMaterialCalculator.css'

// Robust unit conversion utility between volumetric and mass units
export function convertQuantity(value, fromUnit, toUnit) {
  if (value == null || isNaN(value)) return 0
  const f = String(fromUnit || '').trim().toLowerCase()
  const t = String(toUnit || '').trim().toLowerCase()
  if (f === t) return Number(value)

  // Litres to Millilitres
  if (['lit', 'l', 'liter', 'litre', 'litres', 'ltr'].includes(f) && ['ml', 'milliliter', 'millilitre'].includes(t)) {
    return Number(value) * 1000
  }
  // Millilitres to Litres
  if (['ml', 'milliliter', 'millilitre'].includes(f) && ['lit', 'l', 'liter', 'litre', 'litres', 'ltr'].includes(t)) {
    return Number(value) / 1000
  }
  // Kilograms to Grams
  if (['kg', 'kilogram'].includes(f) && ['gm', 'g', 'gram'].includes(t)) {
    return Number(value) * 1000
  }
  // Grams to Kilograms
  if (['gm', 'g', 'gram'].includes(f) && ['kg', 'kilogram'].includes(t)) {
    return Number(value) / 1000
  }

  return Number(value)
}

// Thousands separator number formatting helper (Indian / International ERP standard)
export function formatNum(val, decimals = 3) {
  if (val == null || isNaN(val)) return '0'
  const n = Number(val)
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Default composition matching the Excel sheet EXACTLY with catalog material bindings
export const EXCEL_MASTER_COMPOSITION = [
  { id: 'c-1',  name: 'Sepia',            potency: '200',   baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 36, materialCode: 'SEH', alcoholPct: 40.0 },
  { id: 'c-2',  name: 'Palladium',        potency: '1025M', baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 37, materialCode: 'PH',  alcoholPct: 0.0 },
  { id: 'c-3',  name: 'Borex',            potency: '4C',    baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 38, materialCode: 'BH',  alcoholPct: 0.0 },
  { id: 'c-4',  name: 'Apis mel',         potency: '1M',    baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 24, materialCode: 'AM',  alcoholPct: 60.0 },
  { id: 'c-5',  name: 'Murex Pur',        potency: '200',   baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 39, materialCode: 'MP',  alcoholPct: 0.0 },
  { id: 'c-6',  name: 'Aurum Met',        potency: '200',   baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 40, materialCode: 'AMH', alcoholPct: 0.0 },
  { id: 'c-7',  name: 'Platina',          potency: '1M',    baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 51, materialCode: 'P22', alcoholPct: 0.0 },
  { id: 'c-8',  name: 'Clomid',           potency: '3X',    baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 52, materialCode: 'CL1', alcoholPct: 0.0 },
  { id: 'c-9',  name: 'Glycry zha glab',  potency: '1X',    baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 53, materialCode: 'GL1', alcoholPct: 0.0 },
  { id: 'c-10', name: 'caulo phyllum',    potency: '2X',    baseQty: 3, unit: 'lit', category: 'ACTIVE', materialId: 54, materialCode: 'CP',  alcoholPct: 0.0 },
]

export const EXCEL_MASTER_PRESERVATIVES = [
  { id: 'p-1', name: 'Potassium sorbat', potency: '', baseQty: 38, unit: 'Gm', category: 'EXCIPIENT', materialId: 56, materialCode: 'PS' },
  { id: 'p-2', name: 'Bronopol', potency: '', baseQty: 15, unit: 'Gm', category: 'EXCIPIENT', materialId: 57, materialCode: 'BP' },
]

export default function ProductionRawMaterialCalculator({
  companyId,
  formula,
  revision,
  product,
  onOpenBmrSlip,
}) {
  // Target & Pack Mode
  const [calcMode, setCalcMode] = useState('BOTTLES') // 'BOTTLES' | 'VOLUME'
  const [bottleCount, setBottleCount] = useState('3000')
  const [packSizeMl, setPackSizeMl] = useState('30')
  const [targetVolumeLtr, setTargetVolumeLtr] = useState('90')
  const [baseBatchLtr, setBaseBatchLtr] = useState('30')

  // Samples & Batch Output Allocation Split (Make-to-Order vs General Warehouse Buffer)
  const [qcSampleQty, setQcSampleQty] = useState('5')
  const [retentionSampleQty, setRetentionSampleQty] = useState('5')
  const [linkedSalesOrder, setLinkedSalesOrder] = useState('')
  const [orderAllocatedQty, setOrderAllocatedQty] = useState('')

  // Alcohol & Vehicle calculation
  const [alcCalcMode, setAlcCalcMode] = useState('AUTO') // 'AUTO' | 'MANUAL'
  const [manualGrossAlcohol, setManualGrossAlcohol] = useState('')
  const [manualGrossAlcoholUnit, setManualGrossAlcoholUnit] = useState('lit') // 'lit' | 'ML'
  const [targetAlcoholPct, setTargetAlcoholPct] = useState('10.00')
  const [alcoholStrengthPct, setAlcoholStrengthPct] = useState('96.00')

  // Batch Metadata matching Excel
  const [companyName, setCompanyName] = useState('SVL HOMOEO VET')
  const [companyCode, setCompanyCode] = useState('SVL')
  const [productCode, setProductCode] = useState(product?.code || formula?.product_code || '')
  const [productName, setProductName] = useState(product?.name || formula?.product_name || 'Formula Product')
  const [batchNo, setBatchNo] = useState('AH2602')
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0])
  const [specialNotes, setSpecialNotes] = useState(
    '* Preservative as usual'
  )

  const [actionSuccess, setActionSuccess] = useState('')
  const [savingRevision, setSavingRevision] = useState(false)
  const [revisionError, setRevisionError] = useState('')

  // Issue to Production state
  const [issuingToProduction, setIssuingToProduction] = useState(false)
  const [issueProgress, setIssueProgress] = useState({ current: 0, total: 0, currentItem: '' })
  const [issueResults, setIssueResults] = useState(null) // { success: [], failed: [] }

  const navigate = useNavigate()
  const { companies } = useSelectedCompany()

  // Inventory & Store Stock Verification
  const [stores, setStores] = useState([])
  const [selectedStoreId, setSelectedStoreId] = useState('')
  const [stockBalances, setStockBalances] = useState({})
  const [stockLoading, setStockLoading] = useState(false)
  const [stockRefreshCount, setStockRefreshCount] = useState(0)

  // Direct Purchase Order Modal from Shortages
  const [createPoModalOpen, setCreatePoModalOpen] = useState(false)
  const [prefillPoOrder, setPrefillPoOrder] = useState(null)

  // Themed Issue to Production Confirmation Modal
  const [confirmIssueModalOpen, setConfirmIssueModalOpen] = useState(false)

  // Helper to extract active raw materials from revision lines
  const extractRawLines = useCallback((lines) => {
    if (!Array.isArray(lines)) return []
    return lines
      .filter((l) => l.material_type === 'RAW_MATERIAL' || l.material_type === 'ACTIVE' || (!l.material_type && !l.notes?.includes('excipient')))
      .map((l, idx) => ({
        id: l.id || `raw-${idx}`,
        part: (() => {
          if (l.part) return Number(l.part)
          if (l.notes) {
            const m = l.notes.match(/PART:(\d+)/)
            if (m) return Number(m[1])
          }
          return 1
        })(),
        materialId: l.material_id || l.material?.id || null,
        materialCode: l.material_code || l.material?.code || '',
        name: l.material_name || l.material?.name || l.material_code || `Material ${idx + 1}`,
        potency: l.potency || '',
        baseQty: Number(l.quantity) || 0,
        unit: l.unit_code || l.unit?.code || l.unit || 'ML',
        alcoholPct: (() => {
          if (l.material_alcohol_percentage != null) return Number(l.material_alcohol_percentage)
          if (l.material?.alcohol_percentage != null) return Number(l.material.alcohol_percentage)
          if (l.alcoholPct != null) return Number(l.alcoholPct)
          const pot = String(l.potency || '').trim().toUpperCase()
          const nm = String(l.material_name || l.material?.name || '').trim().toUpperCase()
          if (pot === 'Q' || nm.endsWith(' Q') || nm.includes('TINCTURE')) return 60
          return 0
        })(),
        ar_no: l.ar_no || '',
        category: 'ACTIVE',
      }))
  }, [])

  // Helper to extract excipients from revision lines
  const extractExcLines = useCallback((lines) => {
    if (!Array.isArray(lines)) return []
    return lines
      .filter((l) => l.material_type === 'EXCIPIENT' || l.notes?.includes('excipient'))
      .map((l, idx) => ({
        id: l.id || `exc-${idx}`,
        materialId: l.material_id || l.material?.id || null,
        materialCode: l.material_code || l.material?.code || '',
        name: l.material_name || l.material?.name || l.material_code || `Excipient ${idx + 1}`,
        potency: l.potency || '',
        baseQty: Number(l.quantity) || 0,
        unit: l.unit_code || l.unit?.code || l.unit || 'Gm',
        ar_no: l.ar_no || '',
        category: 'EXCIPIENT',
      }))
  }, [])

  // Lines setup: Start with current revision's formula lines by default!
  const [compositions, setCompositions] = useState(() => {
    if (revision?.lines && revision.lines.length > 0) {
      const raw = extractRawLines(revision.lines)
      if (raw.length > 0) return raw
    }
    if (product?.code === 'SVL/08') {
      return EXCEL_MASTER_COMPOSITION.map((c) => ({ ...c }))
    }
    return []
  })

  const [preservatives, setPreservatives] = useState(() => {
    if (revision?.lines && revision.lines.length > 0) {
      const exc = extractExcLines(revision.lines)
      if (exc.length > 0) return exc
    }
    if (product?.code === 'SVL/08') {
      return EXCEL_MASTER_PRESERVATIVES.map((p) => ({ ...p }))
    }
    return []
  })

  const isTwoPart = Boolean(
    (revision?.notes && (revision.notes.includes('FORMULA_PARTS:2') || revision.notes.includes('TWO_PART:true'))) ||
    (revision?.lines || []).some((l) => l.part === 2 || (l.notes && l.notes.includes('PART:2'))) ||
    compositions.some((c) => c.part === 2)
  )

  // Synchronize product metadata
  useEffect(() => {
    if (product?.name) setProductName(product.name)
    if (product?.code) setProductCode(product.code)
  }, [product?.name, product?.code])

  // Synchronize formula lines and batch size whenever revision changes
  useEffect(() => {
    if (!revision) return

    // 1. Sync batch size / base output
    const baseQty = parseFloat(revision.base_output_quantity) || 0
    const uomCode = (revision.output_uom_code || '').toUpperCase()
    const pack = parseFloat(packSizeMl) || 30

    if (baseQty > 0) {
      if (['BTL', 'BOTTLE', 'BOTTLES', 'NOS', 'NO', 'TAB', 'TABLET', 'TABLETS'].includes(uomCode)) {
        setBottleCount(String(Math.round(baseQty)))
        const exactLtr = (baseQty * pack) / 1000
        const formattedLtr = String(Math.round(exactLtr * 100) / 100)
        setBaseBatchLtr(formattedLtr)
        setTargetVolumeLtr(formattedLtr)
      } else {
        setBaseBatchLtr(String(baseQty))
        setTargetVolumeLtr(String(baseQty))
        if (pack > 0) {
          setBottleCount(String(Math.round((baseQty * 1000) / pack)))
        }
      }
    }

    // 2. Load lines from revision
    if (Array.isArray(revision.lines) && revision.lines.length > 0) {
      const rawLines = extractRawLines(revision.lines)
      const excLines = extractExcLines(revision.lines)

      setCompositions(rawLines)
      setPreservatives(excLines)
    } else {
      if (product?.code === 'SVL/08') {
        setCompositions(EXCEL_MASTER_COMPOSITION.map((c) => ({ ...c })))
        setPreservatives(EXCEL_MASTER_PRESERVATIVES.map((p) => ({ ...p })))
      } else {
        setCompositions([])
        setPreservatives([])
      }
    }
  }, [revision?.id, revision?.lines, revision?.base_output_quantity, revision?.output_uom_code, product?.code, packSizeMl, extractRawLines, extractExcLines])

  // Auto-calculate: whenever bottle count or pack size changes, recalculate target volume
  useEffect(() => {
    if (calcMode === 'BOTTLES') {
      const bottles = parseFloat(bottleCount) || 0
      const pack = parseFloat(packSizeMl) || 30
      if (bottles > 0 && pack > 0) {
        // e.g. 6048 bottles × 30ml = 181440 ml = 181.44 litres
        const exactLtr = (bottles * pack) / 1000
        setTargetVolumeLtr(String(Math.round(exactLtr * 100) / 100))
      }
    }
  }, [bottleCount, packSizeMl, calcMode])

  // Synchronize bottles when target volume changes in VOLUME mode
  const handleVolumeChange = (vol) => {
    setTargetVolumeLtr(vol)
    const v = parseFloat(vol) || 0
    const p = parseFloat(packSizeMl) || 30
    if (v > 0 && p > 0) {
      setBottleCount(String(Math.round((v * 1000) / p)))
    }
  }

  // Multiplier / Scale Factor
  const baseVol = parseFloat(baseBatchLtr) || 30
  const targetVol = parseFloat(targetVolumeLtr) || 90
  const scaleMultiplier = baseVol > 0 ? targetVol / baseVol : 1

  // Alcohol & Water Vehicle Calculation
  const alcPct = parseFloat(targetAlcoholPct) || 10.0
  const alcStrength = parseFloat(alcoholStrengthPct) || 96.0

  // 1. Auto-calculated theoretical gross alcohol
  const autoGrossAlcoholLtr = useMemo(() => {
    if (targetVol <= 0 || alcStrength <= 0) return 0
    return Math.round(((targetVol * alcPct) / alcStrength) * 1000) / 1000
  }, [targetVol, alcPct, alcStrength])

  // 2. Resolved Gross Alcohol Required (respects Manual override vs Auto calc)
  const grossAlcoholRequiredLtr = useMemo(() => {
    if (alcCalcMode === 'MANUAL') {
      const val = parseFloat(manualGrossAlcohol)
      if (isNaN(val) || val < 0) return 0
      return manualGrossAlcoholUnit === 'ML'
        ? Math.round((val / 1000) * 1000) / 1000
        : Math.round(val * 1000) / 1000
    }
    return autoGrossAlcoholLtr
  }, [alcCalcMode, manualGrossAlcohol, manualGrossAlcoholUnit, autoGrossAlcoholLtr])

  // Backward-compatible alias for existing code
  const alcoholRequiredLtr = grossAlcoholRequiredLtr
  const grossAlcoholRequiredMl = Math.round(grossAlcoholRequiredLtr * 1000 * 10) / 10

  // 3. Alcohol contributed by each raw material (in both Litres and ML)
  // C1*V1 = Σ(C2*V2) — Calculate alcohol already contributed by raw materials
  const rawMaterialAlcoholBreakdown = useMemo(() => {
    return compositions.map((row) => {
      const c2 = (Number(row.alcoholPct) || 0) / 100 // fraction
      const targetQty = Number(row.baseQty) * scaleMultiplier
      const targetQtyLtr = convertQuantity(targetQty, row.unit, 'lit')
      const targetQtyMl = convertQuantity(targetQty, row.unit, 'ml')
      const alcoholContributionLtr = Math.round(c2 * targetQtyLtr * 10000) / 10000
      const alcoholContributionMl = Math.round(c2 * targetQtyMl * 100) / 100
      return {
        id: row.id,
        name: row.name,
        unit: row.unit,
        alcoholPct: Number(row.alcoholPct) || 0,
        targetQty,
        targetQtyLtr,
        targetQtyMl,
        alcoholContributionLtr,
        alcoholContributionMl,
      }
    })
  }, [compositions, scaleMultiplier])

  // Sum of pure alcohol already present in active raw materials
  const totalRawMaterialAlcoholLtr = useMemo(() => {
    const total = rawMaterialAlcoholBreakdown.reduce((sum, r) => sum + r.alcoholContributionLtr, 0)
    return Math.round(total * 1000) / 1000
  }, [rawMaterialAlcoholBreakdown])

  const totalRawMaterialAlcoholMl = useMemo(() => {
    return Math.round(totalRawMaterialAlcoholLtr * 1000 * 10) / 10
  }, [totalRawMaterialAlcoholLtr])

  // Total volume of liquid active raw materials (in litres)
  const totalLiquidRmVolumeLtr = useMemo(() => {
    const total = compositions.reduce((sum, row) => {
      const u = String(row.unit || '').trim().toLowerCase()
      if (['lit', 'l', 'liter', 'litre', 'litres', 'ltr', 'ml', 'milliliter', 'millilitre'].includes(u)) {
        const qty = Number(row.baseQty) * scaleMultiplier
        return sum + convertQuantity(qty, row.unit, 'lit')
      }
      return sum
    }, 0)
    return Math.round(total * 1000) / 1000
  }, [compositions, scaleMultiplier])

  // 4. Net ENA/RS required = gross alcohol required minus alcohol already present in raw materials
  const netAlcoholRequiredLtr = useMemo(() => {
    return Math.round(Math.max(0, grossAlcoholRequiredLtr - totalRawMaterialAlcoholLtr) * 1000) / 1000
  }, [grossAlcoholRequiredLtr, totalRawMaterialAlcoholLtr])

  const netAlcoholRequiredMl = useMemo(() => {
    return Math.round(netAlcoholRequiredLtr * 1000 * 10) / 10
  }, [netAlcoholRequiredLtr])

  // 5. Water required (Q.S. to batch volume minus liquid raw materials and net ENA)
  const waterRequiredLtr = useMemo(() => {
    const w = targetVol - totalLiquidRmVolumeLtr - netAlcoholRequiredLtr
    return Math.round(Math.max(0, w) * 1000) / 1000
  }, [targetVol, totalLiquidRmVolumeLtr, netAlcoholRequiredLtr])

  const waterRequiredMl = useMemo(() => {
    return Math.round(waterRequiredLtr * 1000 * 10) / 10
  }, [waterRequiredLtr])

  const totalActiveBaseQty = useMemo(() => {
    return compositions.reduce((sum, r) => sum + (Number(r.baseQty) || 0), 0)
  }, [compositions])

  const totalActiveTargetQty = useMemo(() => {
    return compositions.reduce((sum, r) => sum + (Number(r.baseQty) * scaleMultiplier || 0), 0)
  }, [compositions, scaleMultiplier])

  // Packaging materials auto-calculation (Attachment 4)
  const totalBottles = parseInt(bottleCount, 10) || Math.round((targetVol * 1000) / (parseFloat(packSizeMl) || 30))

  // Commercial Output & Sample Reconciliation Numbers
  const qcSampleNum = Math.max(0, parseInt(qcSampleQty, 10) || 0)
  const retentionSampleNum = Math.max(0, parseInt(retentionSampleQty, 10) || 0)
  const totalSamplesNum = qcSampleNum + retentionSampleNum
  const netCommercialBottles = Math.max(0, totalBottles - totalSamplesNum)
  const orderAllocatedNum = orderAllocatedQty === '' ? 0 : Math.min(netCommercialBottles, Math.max(0, parseInt(orderAllocatedQty, 10) || 0))
  const bufferStockNum = Math.max(0, netCommercialBottles - orderAllocatedNum)
  const packagingLines = useMemo(() => {
    const revPkg = (revision?.lines || []).filter(
      (l) => l.material_type === 'PACKAGING_MATERIAL' || l.material_type === 'PACKAGING'
    )
    if (revPkg.length > 0) {
      return revPkg.map((l, idx) => ({
        id: `pkg-${l.id ?? idx}`,
        name: l.material?.name || l.material_name || '',
        materialId: l.material?.id || l.material_id,
        materialCode: l.material?.code || l.material_code,
        qty: l.quantity ? Math.round(Number(l.quantity) * (totalBottles > 0 && revision.base_output_quantity ? totalBottles / Number(revision.base_output_quantity) : 1)) : totalBottles,
        unit: l.unit || l.unit_code || 'NOS',
        ar_no: l.ar_no || '',
      }))
    }
    return [
      { id: 'pkg-0', name: `${packSizeMl}ml Dropper Glass/PET Bottles`, qty: totalBottles, unit: 'NOS' },
      { id: 'pkg-1', name: 'Dropper Assembly Caps (Cap + Teat + Pipette)', qty: totalBottles, unit: 'NOS' },
      { id: 'pkg-2', name: `Printed Unit Labels (${productName} ${packSizeMl}ml)`, qty: totalBottles, unit: 'NOS' },
      { id: 'pkg-3', name: `Outer Printed Unit Cartons (${packSizeMl}ml)`, qty: totalBottles, unit: 'NOS' },
      { id: 'pkg-4', name: '5-Ply Corrugated Master Shippers (Pack of 48)', qty: Math.ceil(totalBottles / 48), unit: 'BOX' },
      { id: 'pkg-5', name: 'Self-Adhesive BOPP Packaging Tape (Brown/Clear)', qty: Math.ceil(totalBottles / 500) || 1, unit: 'NOS' },
    ]
  }, [packSizeMl, productName, totalBottles, revision])

  // Fetch user's stores for inventory availability check
  useEffect(() => {
    let cancelled = false
    getMyStores()
      .then((rows) => {
        if (cancelled) return
        setStores(rows)
        if (rows.length > 0) {
          setSelectedStoreId((current) => current || String(rows[0].id))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Load active catalog materials for fuzzy name matching and autocompletion
  const [catalogMaterials, setCatalogMaterials] = useState([])
  const [catalogPkgMaterials, setCatalogPkgMaterials] = useState([])
  useEffect(() => {
    searchMaterials('', 'RAW_MATERIAL', 300)
      .then((rows) => setCatalogMaterials(rows || []))
      .catch(() => {})
    searchMaterials('', 'PACKAGING_MATERIAL', 300)
      .then((rows) => setCatalogPkgMaterials(rows || []))
      .catch(() => {})
  }, [])

  const resolveMaterialId = (item) => {
    if (!item) return null
    if (item.materialId) return item.materialId
    if (item.material_id) return item.material_id
    const n = (item.name || '').toLowerCase().trim()
    const code = (item.materialCode || item.code || '').toLowerCase().trim()

    // Must have a non-empty name or code to match anything
    if (!n && !code) return null

    const allCat = [...catalogMaterials, ...catalogPkgMaterials]

    // 1. Direct exact match from catalog materials
    const exactMatch = allCat.find((cm) => {
      const cmn = (cm.name || '').toLowerCase().trim()
      const cmc = (cm.code || '').toLowerCase().trim()
      return (cmn && n && cmn === n) || (cmc && code && cmc === code)
    })
    if (exactMatch) return exactMatch.id

    // 2. Substring match (only if n has at least 3 chars to prevent accidental matches on empty or tiny strings)
    if (n.length >= 3) {
      const subMatch = allCat.find((cm) => {
        const cmn = (cm.name || '').toLowerCase().trim()
        return (cmn && cmn.includes(n)) || (cmn && n.includes(cmn))
      })
      if (subMatch) return subMatch.id
    }

    // 3. Fallback heuristic matching for known standard homeopathic ingredients
    if (n.length >= 3) {
      if (n.includes('apis')) return 24 // APIS -MELLIFICA
      if (n.includes('sepia')) return 36 // SEPIA H.P.1
      if (n.includes('pallad')) return 37 // PALLADIUM H.P.
      if (n.includes('borex') || n.includes('borax')) return 38 // BOREX H.P.I
      if (n.includes('murex')) return 39 // MUREX PURPUREA
      if (n.includes('aurum')) return 40 // AURUM METALLICUM H.P.I
      if (n.includes('platina')) return 51 // Platina (P22)
      if (n.includes('clomid')) return 52 // Clomid (CL1)
      if (n.includes('glab') || n.includes('glycry')) return 53 // Glycry zha glab (GL1)
      if (n.includes('caulo')) return 54 // caulo phyllum (CP)
      if (n.includes('alcohol')) return 32 // ALCOHOL CONTENT
      if (n.includes('water')) return 41 // PURIFIED WATER
      if (n.includes('potassium') || n.includes('sorbat')) return 56 // Potassium sorbat (PS)
      if (n.includes('bronopol')) return 57 // Bronopol (BP)
    }
    return null
  }

  const resolveMaterialMeta = (item) => {
    const matId = resolveMaterialId(item)
    const n = (item.name || '').toLowerCase().trim()
    let code = item.materialCode || item.code || ''
    if (!code && matId) {
      const cm = [...catalogMaterials, ...catalogPkgMaterials].find((c) => String(c.id) === String(matId))
      if (cm?.code) code = cm.code
    }
    if (!code && n.length >= 3) {
      if (n.includes('apis')) code = 'AM'
      else if (n.includes('sepia')) code = 'SEH'
      else if (n.includes('pallad')) code = 'PH'
      else if (n.includes('borex') || n.includes('borax')) code = 'BH'
      else if (n.includes('murex')) code = 'MP'
      else if (n.includes('aurum')) code = 'AMH'
      else if (n.includes('platina')) code = 'P22'
      else if (n.includes('clomid')) code = 'CL1'
      else if (n.includes('glab') || n.includes('glycry')) code = 'GL1'
      else if (n.includes('caulo')) code = 'CP'
      else if (n.includes('alcohol')) code = 'AC'
      else if (n.includes('water')) code = 'PW'
      else if (n.includes('potassium') || n.includes('sorbat')) code = 'PS'
      else if (n.includes('bronopol')) code = 'BP'
    }
    return { matId, code }
  }

  // Open Direct Purchase Order Modal for a single shortage material
  const handleOpenPoForRow = (row, diffQty) => {
    const meta = resolveMaterialMeta(row)
    const storeUnit = (stockBalances[row.id]?.storeUnit || row.unit || 'lit').toUpperCase()
    const orderQty = Math.ceil(convertQuantity(diffQty, row.unit, storeUnit) * 100) / 100
    setPrefillPoOrder({
      notes: `Purchase requisition for ${row.name} - Formula: ${productName} (Batch ${batchNo})`,
      lines: [
        {
          material_id: meta.matId || '',
          material_name: row.name,
          material_code: meta.code || '',
          material_kind: row.isPackaging ? 'PACKAGING' : 'RAW',
          unit_code: storeUnit,
          quantity: orderQty > 0 ? orderQty : 1,
          unit_price: 0,
        },
      ],
    })
    setCreatePoModalOpen(true)
  }

  // Open Direct Purchase Order Modal prefilled with ALL shortage materials
  const handleOpenPoForShortages = () => {
    if (!stockSummary.shortages.length) return
    const lines = stockSummary.shortages.map((s) => {
      const storeUnit = (s.storeUnit || s.unit || 'lit').toUpperCase()
      const orderQty = Math.ceil(convertQuantity(s.diff, s.unit, storeUnit) * 100) / 100
      return {
        material_id: s.materialId || '',
        material_name: s.name,
        material_code: s.materialCode || '',
        material_kind: 'RAW',
        unit_code: storeUnit,
        quantity: orderQty > 0 ? orderQty : 1,
        unit_price: 0,
      }
    })
    setPrefillPoOrder({
      notes: `Bulk shortage purchase requisition for ${productName} (Batch ${batchNo}) - ${stockSummary.shortages.length} shortage items`,
      lines,
    })
    setCreatePoModalOpen(true)
  }

  // Query live stock balance from store for each formula raw material and packaging
  useEffect(() => {
    if (!selectedStoreId) return
    let cancelled = false
    setStockLoading(true)

    const items = [
      ...compositions.filter((c) => c.name && c.name.trim()),
      ...preservatives.filter((p) => p.name && p.name.trim()),
      ...packagingLines.filter((pkg) => pkg.name && pkg.name.trim()),
      { id: 'alc', name: 'Alcohol', unit: 'LTR', materialId: 32 },
      { id: 'water', name: 'Purified Water', unit: 'LTR', materialId: 41 },
    ]

    Promise.all(
      items.map((it) => {
        const matId = resolveMaterialId(it)
        if (!matId) {
          return Promise.resolve({
            id: it.id,
            totalAvail: 0,
            rawAvail: 0,
            storeUnit: it.unit || 'lit',
            hasRecord: false,
            matId: null,
          })
        }
        return getAvailableToIssue(selectedStoreId, matId)
          .then((rows) => {
            const compRows = (rows || []).filter((r) => !companyId || String(r.source_company_id) === String(companyId))
            let chosenRow = compRows[0]
            if (compRows.length > 1) {
              chosenRow = compRows.reduce((best, curr) => {
                const bestQty = convertQuantity(best.net_quantity, best.unit_code, it.unit || 'lit')
                const currQty = convertQuantity(curr.net_quantity, curr.unit_code, it.unit || 'lit')
                return currQty > bestQty ? curr : best
              }, compRows[0])
            }
            const storeUnit = chosenRow ? (chosenRow.unit_code || 'ML') : 'ML'
            const storeUnitId = chosenRow ? chosenRow.unit_id : null
            const rawAvail = chosenRow ? Number(chosenRow.net_quantity) : 0
            const converted = convertQuantity(rawAvail, storeUnit, it.unit || 'lit')
            return {
              id: it.id,
              totalAvail: converted,
              rawAvail,
              storeUnit,
              storeUnitId,
              hasRecord: Boolean(chosenRow),
              matId,
            }
          })
          .catch(() => ({
            id: it.id,
            totalAvail: 0,
            rawAvail: 0,
            storeUnit: it.unit || 'lit',
            storeUnitId: null,
            hasRecord: false,
            matId,
          }))
      })
    )
      .then((res) => {
        if (cancelled) return
        const map = {}
        res.forEach((r) => {
          map[r.id] = r
        })
        setStockBalances(map)
      })
      .finally(() => {
        if (!cancelled) setStockLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedStoreId, companyId, compositions, preservatives, packagingLines, catalogMaterials, catalogPkgMaterials, stockRefreshCount])

  // Comprehensive stock summary comparing required quantities against store balances
  const stockSummary = useMemo(() => {
    const list = []
    // 1. Active Compositions (skip rows with empty names)
    compositions.forEach((row) => {
      if (!row.name || !row.name.trim()) return
      const targetQty = Number((Number(row.baseQty) * scaleMultiplier).toFixed(2))
      const stockInfo = stockBalances[row.id]
      const avail = stockInfo ? stockInfo.totalAvail : 0
      const rawAvail = stockInfo ? stockInfo.rawAvail : 0
      const storeUnit = stockInfo ? stockInfo.storeUnit : row.unit
      const isShort = avail < targetQty
      const diff = Math.max(0, targetQty - avail)
      const meta = resolveMaterialMeta(row)
      list.push({
        id: row.id,
        name: row.name,
        targetQty,
        avail,
        rawAvail,
        storeUnit,
        unit: row.unit,
        isShort,
        diff,
        materialId: meta.matId,
        materialCode: meta.code,
        rowObj: row,
      })
    })
    // 2. Preservatives (skip rows with empty names)
    preservatives.forEach((row) => {
      if (!row.name || !row.name.trim()) return
      const targetQty = Number((Number(row.baseQty) * scaleMultiplier).toFixed(2))
      const stockInfo = stockBalances[row.id]
      const avail = stockInfo ? stockInfo.totalAvail : 0
      const rawAvail = stockInfo ? stockInfo.rawAvail : 0
      const storeUnit = stockInfo ? stockInfo.storeUnit : row.unit
      const isShort = avail < targetQty
      const diff = Math.max(0, targetQty - avail)
      const meta = resolveMaterialMeta(row)
      list.push({
        id: row.id,
        name: row.name,
        targetQty,
        avail,
        rawAvail,
        storeUnit,
        unit: row.unit,
        isShort,
        diff,
        materialId: meta.matId,
        materialCode: meta.code,
        rowObj: row,
      })
    })
    // 3. Packaging Materials (Attachment 4)
    packagingLines.forEach((pkg) => {
      if (!pkg.name || !pkg.name.trim()) return
      const stockInfo = stockBalances[pkg.id]
      const avail = stockInfo ? stockInfo.totalAvail : 0
      const rawAvail = stockInfo ? stockInfo.rawAvail : 0
      const storeUnit = stockInfo ? stockInfo.storeUnit : pkg.unit
      const hasRecord = stockInfo ? stockInfo.hasRecord : false
      const targetQty = Number(pkg.qty) || 0
      const isShort = hasRecord && avail < targetQty
      const diff = Math.max(0, targetQty - avail)
      const matId = resolveMaterialId(pkg)
      list.push({
        id: pkg.id,
        name: pkg.name,
        targetQty,
        avail,
        rawAvail,
        storeUnit,
        unit: pkg.unit,
        isShort,
        diff,
        materialId: matId,
        materialCode: pkg.materialCode || '',
        rowObj: pkg,
        isPackaging: true,
      })
    })
    // 4. Alcohol Vehicle (use net after raw material deductions)
    const alcStockInfo = stockBalances['alc']
    const alcAvail = alcStockInfo ? alcStockInfo.totalAvail : 0
    const alcRawAvail = alcStockInfo ? alcStockInfo.rawAvail : 0
    const alcShort = alcAvail < netAlcoholRequiredLtr
    list.push({
      id: 'alc',
      name: 'Dispensing Alcohol (ENA / RS)',
      targetQty: netAlcoholRequiredLtr,
      avail: alcAvail,
      rawAvail: alcRawAvail,
      storeUnit: alcStockInfo ? alcStockInfo.storeUnit : 'LTR',
      unit: 'LTR',
      isShort: alcShort,
      diff: Math.max(0, netAlcoholRequiredLtr - alcAvail),
      materialId: 32,
      materialCode: 'AC',
    })

    const shortages = list.filter((l) => l.isShort)
    return {
      allInStock: shortages.length === 0,
      shortageCount: shortages.length,
      shortages,
      list,
    }
  }, [compositions, preservatives, packagingLines, scaleMultiplier, stockBalances, alcoholRequiredLtr, netAlcoholRequiredLtr, catalogMaterials, catalogPkgMaterials])

  // Reset to Excel Master Template (3 Liters each for 30L base)
  const handleApplyExcelTemplate = () => {
    setBaseBatchLtr('30')
    setBottleCount('3024')
    setPackSizeMl('30')
    // targetVolumeLtr will auto-update via useEffect: 3024 × 30 / 1000 = 90.72
    setCompositions(EXCEL_MASTER_COMPOSITION.map((c) => ({ ...c })))
    setPreservatives(EXCEL_MASTER_PRESERVATIVES.map((p) => ({ ...p })))
    setActionSuccess('Excel Master Formula (3 Liters / 30L → ~9 Liters / 90.72L) applied!')
    setTimeout(() => setActionSuccess(''), 5000)
  }

  // Load / Reset from current database revision lines
  const handleLoadSavedRevision = () => {
    if (!revision) {
      setRevisionError('No formula revision loaded to reset from.')
      return
    }
    const rawLines = extractRawLines(revision.lines)
    const excLines = extractExcLines(revision.lines)

    setCompositions(rawLines)
    setPreservatives(excLines)

    setActionSuccess(`Formula reset from saved Revision (${rawLines.length} raw materials, ${excLines.length} excipients).`)
    setTimeout(() => setActionSuccess(''), 4000)
  }

  // Row update handlers with catalog auto-binding
  const updateComp = (id, field, val) => {
    setCompositions((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const next = { ...c, [field]: val }
        if (field === 'name') {
          const trimmed = String(val || '').trim().toLowerCase()
          if (!trimmed) {
            next.name = ''
            next.materialId = null
            next.materialCode = ''
            return next
          }
          const allCat = [...catalogMaterials, ...catalogPkgMaterials]
          const match = allCat.find(
            (cm) =>
              (cm.name && cm.name.toLowerCase() === trimmed) ||
              (cm.label && cm.label.toLowerCase() === trimmed) ||
              (cm.code && cm.code.toLowerCase() === trimmed)
          )
          if (match) {
            next.name = match.name
            next.materialId = match.id
            next.materialCode = match.code
            if (match.unitCode) next.unit = match.unitCode
            if (match.alcohol_percentage != null && (c.alcoholPct == null || Number(c.alcoholPct) === 0)) {
              next.alcoholPct = Number(match.alcohol_percentage)
            }
          } else {
            next.materialId = null
            next.materialCode = ''
          }
        }
        return next
      })
    )
  }

  // Quick preset: Set all Mother Tinctures (Q) to standard 60% alcohol
  const handleSetTincturesAlcohol = (pct = 60) => {
    setCompositions((prev) =>
      prev.map((c) => {
        const isTincture =
          String(c.potency || '').trim().toUpperCase() === 'Q' ||
          String(c.name || '').trim().toUpperCase().endsWith(' Q') ||
          String(c.name || '').toLowerCase().includes('tincture') ||
          String(c.name || '').toLowerCase().includes('mother')
        if (isTincture) {
          return { ...c, alcoholPct: pct }
        }
        return c
      })
    )
    setActionSuccess(`Set Mother Tinctures (Q) to ${pct}% alcohol content.`)
    setTimeout(() => setActionSuccess(''), 4000)
  }

  // Allow editing target qty directly and back-calculating base qty
  const updateCompTarget = (id, targetVal) => {
    const num = parseFloat(targetVal) || 0
    const calculatedBase = scaleMultiplier > 0 ? num / scaleMultiplier : num
    setCompositions((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, baseQty: Math.round(calculatedBase * 1000) / 1000 }
          : c
      )
    )
  }

  const updatePres = (id, field, val) => {
    setPreservatives((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const next = { ...p, [field]: val }
        if (field === 'name') {
          const trimmed = String(val || '').trim().toLowerCase()
          if (!trimmed) {
            next.name = ''
            next.materialId = null
            next.materialCode = ''
            return next
          }
          const allCat = [...catalogMaterials, ...catalogPkgMaterials]
          const match = allCat.find(
            (cm) =>
              (cm.name && cm.name.toLowerCase() === trimmed) ||
              (cm.label && cm.label.toLowerCase() === trimmed) ||
              (cm.code && cm.code.toLowerCase() === trimmed)
          )
          if (match) {
            next.name = match.name
            next.materialId = match.id
            next.materialCode = match.code
            if (match.unitCode) next.unit = match.unitCode
          } else {
            next.materialId = null
            next.materialCode = ''
          }
        }
        return next
      })
    )
  }

  const updatePresTarget = (id, targetVal) => {
    const num = parseFloat(targetVal) || 0
    const calculatedBase = scaleMultiplier > 0 ? num / scaleMultiplier : num
    setPreservatives((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, baseQty: Math.round(calculatedBase * 100) / 100 }
          : p
      )
    )
  }

  const addCompRow = () => {
    setCompositions((prev) => [
      ...prev,
      {
        id: `c-new-${Date.now()}`,
        name: '',
        potency: '',
        baseQty: 1,
        unit: 'lit',
        alcoholPct: 0,
        category: 'ACTIVE',
        materialId: null,
        materialCode: '',
      },
    ])
  }

  const addPresRow = () => {
    setPreservatives((prev) => [
      ...prev,
      {
        id: `p-new-${Date.now()}`,
        name: '',
        potency: '',
        baseQty: 1,
        unit: 'Gm',
        category: 'EXCIPIENT',
        materialId: null,
        materialCode: '',
      },
    ])
  }

  const removeRow = (id, isPres = false) => {
    if (isPres) {
      setPreservatives((prev) => prev.filter((p) => p.id !== id))
    } else {
      setCompositions((prev) => prev.filter((c) => c.id !== id))
    }
  }

  // Save this actual formula into the revision BOM lines in the database
  const handleSaveToRevision = async () => {
    if (!revision || !formula || !companyId) {
      setRevisionError('No active formula revision loaded to save.')
      return
    }
    setSavingRevision(true)
    setRevisionError('')
    try {
      // Build raw lines array matching formula lines structure
      const rawRows = compositions.map((c, idx) => ({
        id: c.id?.startsWith('c-') ? null : c.id,
        material: c.materialId ? { id: c.materialId } : { id: 1, name: c.name, code: c.code },
        material_type: 'RAW_MATERIAL',
        quantity: String(c.baseQty),
        unit: c.unit || 'lit',
        potency: c.potency,
        calculation_mode: 'AS_PER_FORMULA',
        ar_no: c.ar_no || '',
      }))

      const excRows = preservatives.map((p, idx) => ({
        id: p.id?.startsWith('p-') ? null : p.id,
        material: p.materialId ? { id: p.materialId } : { id: 2, name: p.name, code: p.code },
        material_type: 'RAW_MATERIAL',
        quantity: String(p.baseQty),
        unit: p.unit || 'Gm',
        potency: p.potency,
        notes: 'excipient',
        calculation_mode: 'AS_PER_FORMULA',
        ar_no: p.ar_no || '',
      }))

      const linesPayload = [
        ...buildRevisionLinesPayload({ allLines: [], kind: 'RAW_MATERIAL', rows: rawRows }),
        ...buildRevisionLinesPayload({ allLines: [], kind: 'RAW_MATERIAL', rows: excRows }),
      ]

      await updateRevision(companyId, formula.id, revision.id, {
        expected_version: revision.version,
        lines: linesPayload,
        base_output_quantity: String(baseBatchLtr),
      })

      setActionSuccess('Master Formula updated! Base quantities (in Liters) permanently saved to Revision.')
      setTimeout(() => setActionSuccess(''), 6000)
    } catch (err) {
      setRevisionError(getErrorMessage(err))
    } finally {
      setSavingRevision(false)
    }
  }

  // Prepare Live Lines payload for BMR Attachment-1 and Attachment-4
  const buildLivePayload = () => {
    const raw = compositions.map((c, idx) => ({
      id: c.id,
      line_number: idx + 1,
      material_type: 'RAW_MATERIAL',
      material_code: c.code || `RM-${String(idx + 1).padStart(3, '0')}`,
      material_name: c.name,
      potency: c.potency,
      quantity: (Number(c.baseQty) * scaleMultiplier).toFixed(2),
      unit: c.unit || 'lit',
      calculation_mode: 'AS_PER_FORMULA',
      ar_no: c.ar_no || '',
    }))

    const exc = [
      ...preservatives.map((p, idx) => ({
        id: p.id,
        line_number: raw.length + idx + 1,
        material_type: 'EXCIPIENT',
        material_code: p.code || `EXC-${String(idx + 1).padStart(3, '0')}`,
        material_name: p.name,
        potency: p.potency || '—',
        quantity: (Number(p.baseQty) * scaleMultiplier).toFixed(2),
        unit: p.unit || 'Gm',
        calculation_mode: 'AS_PER_FORMULA',
        special_value: '',
        ar_no: p.ar_no || '',
      })),
      {
        id: 'alc-line',
        line_number: raw.length + preservatives.length + 1,
        material_type: 'EXCIPIENT',
        material_code: 'RM-ALC',
        material_name: totalRawMaterialAlcoholLtr > 0
          ? `Dispensing Alcohol / ENA (${alcoholStrengthPct}% V/V) — Net after raw material deductions`
          : `Dispensing Alcohol (${alcoholStrengthPct}% V/V)`,
        potency: totalRawMaterialAlcoholLtr > 0
          ? `${targetAlcoholPct}% V/V Target | Gross: ${alcoholRequiredLtr.toFixed(3)}L − RM contrib.: ${totalRawMaterialAlcoholLtr.toFixed(3)}L`
          : `${targetAlcoholPct}% V/V Finished Content`,
        quantity: netAlcoholRequiredLtr.toFixed(3),
        unit: 'lit',
        calculation_mode: 'AS_PER_FORMULA',
        ar_no: '',
      },
      {
        id: 'water-line',
        line_number: raw.length + preservatives.length + 2,
        material_type: 'EXCIPIENT',
        material_code: 'RM-PW',
        material_name: 'Purified Water (DM Water) Q.S.',
        potency: 'Q.S. to 100%',
        quantity: waterRequiredLtr.toFixed(3),
        unit: 'lit',
        calculation_mode: 'EXCIPIENT_QS',
        special_value: 'Q.S.',
        ar_no: '',
      },
    ]

    const pkg = packagingLines.map((p, idx) => ({
      id: `pkg-${idx}`,
      line_number: raw.length + exc.length + idx + 1,
      material_type: 'PACKAGING_MATERIAL',
      material_code: `PM-${String(idx + 1).padStart(3, '0')}`,
      material_name: p.name,
      quantity: String(p.qty),
      quantity_received: String(p.qty),
      unit: p.unit,
      calculation_mode: 'AS_PER_FORMULA',
      ar_no: '',
    }))

    return [...raw, ...exc, ...pkg]
  }

  // Build allocation/sample metadata to pass with BMR slip
  const buildBatchAllocation = () => ({
    totalBottles,
    qcSamples: qcSampleNum,
    retentionSamples: retentionSampleNum,
    totalSamples: totalSamplesNum,
    netCommercialBottles,
    linkedSalesOrder: linkedSalesOrder.trim(),
    orderAllocatedQty: orderAllocatedNum,
    bufferStockQty: bufferStockNum,
    batchVolumeLtr: targetVolumeLtr,
    packSizeMl,
  })

  const handlePrintAttachment1 = () => {
    if (onOpenBmrSlip) {
      onOpenBmrSlip(buildLivePayload(), 'RM', buildBatchAllocation())
    }
  }

  const handlePrintAttachment4 = () => {
    if (onOpenBmrSlip) {
      onOpenBmrSlip(buildLivePayload(), 'PM', buildBatchAllocation())
    }
  }

  // Log retention samples directly to Control Room Register (Schedule M)
  const handleLogToControlSampleRegister = async () => {
    if (retentionSampleNum <= 0) return
    try {
      await controlSamplesService.logSample({
        companyId,
        batchNo: batchNo || 'AH2602',
        productCode: productCode || '',
        productName: productName || 'Finished Medicine',
        packSize: `${packSizeMl} ml`,
        sampleQty: retentionSampleNum,
        unit: 'Bottles',
        storageLocation: 'Control Room Rack A - Main Bay',
        deductFg: true,
        notes: `Retained from batch ${batchNo || 'AH2602'} (${targetVolumeLtr}L / ${totalBottles} bottles). QC testing samples: ${qcSampleNum}.`,
      })
      setActionSuccess(`✓ ${retentionSampleNum} retention samples successfully registered in the Control Sample Register!`)
      setTimeout(() => setActionSuccess(''), 8000)
    } catch (e) {
      setRevisionError(e?.message || 'Failed to log sample')
    }
  }

  // Inward free buffer bottles into Finished Goods Warehouse Store
  const handleInwardBufferToFgWarehouse = async () => {
    if (bufferStockNum <= 0) return
    try {
      await finishedGoodsService.inwardBufferStock({
        batchNo: batchNo || 'AH2602',
        productCode: productCode || '',
        productName: productName || 'Finished Medicine',
        packSize: `${packSizeMl} ml`,
        batchVolumeLtr: targetVolumeLtr,
        grossProducedBottles: totalBottles,
        sampleDeductedBottles: totalSamplesNum,
        netCommercialBottles,
        bufferQty: bufferStockNum,
        initialOrderAllocatedQty: orderAllocatedNum,
        linkedSalesOrder,
        warehouseStore: 'FG Warehouse Store - General Buffer Bay',
      })
      setActionSuccess(`✓ ${bufferStockNum.toLocaleString()} bottles successfully inwarded to Finished Goods Warehouse Store!`)
      setTimeout(() => setActionSuccess(''), 8000)
    } catch (e) {
      setRevisionError(e?.message || 'Failed to inward buffer stock')
    }
  }

  // ── ISSUE TO PRODUCTION ──────────────────────────────────────────────
  // Validates preconditions and opens the themed confirmation modal
  const handleOpenIssueConfirm = () => {
    if (!selectedStoreId) {
      setRevisionError('Please select a store / warehouse first.')
      return
    }
    if (!companyId) {
      setRevisionError('No company selected. Cannot issue materials.')
      return
    }
    if (!stockSummary.allInStock) {
      setRevisionError('Cannot issue to production: some materials are short in inventory.')
      return
    }

    const issuableItems = stockSummary.list.filter((item) => item.materialId && item.targetQty > 0)
    if (issuableItems.length === 0) {
      setRevisionError('No materials with valid catalog IDs found to issue.')
      return
    }

    setIssueResults(null)
    setRevisionError('')
    setConfirmIssueModalOpen(true)
  }

  // Alias for backwards compatibility
  const handleIssueToProduction = handleOpenIssueConfirm

  // Executes the material issue API requests when confirmed in the themed modal
  const handleExecuteIssueToProduction = async () => {
    const issuableItems = stockSummary.list.filter((item) => item.materialId && item.targetQty > 0)
    if (issuableItems.length === 0) return

    setIssuingToProduction(true)
    setIssueResults(null)
    setRevisionError('')
    const success = []
    const failed = []

    for (let i = 0; i < issuableItems.length; i++) {
      const item = issuableItems[i]
      setIssueProgress({ current: i + 1, total: issuableItems.length, currentItem: item.name })

      try {
        // Convert target qty to store unit for the API
        const stockInfo = stockBalances[item.id]
        const storeUnit = stockInfo?.storeUnit || item.unit
        const storeUnitId = stockInfo?.storeUnitId || null
        const issueQty = convertQuantity(item.targetQty, item.unit, storeUnit)

        if (issueQty <= 0) {
          failed.push({ name: item.name, error: 'Calculated issue quantity is zero or negative' })
          continue
        }

        // Step 1: Create DRAFT material issue with store unit
        const idempotencyKey = `prod-issue-${batchNo}-${item.materialId}-${Date.now()}`
        const payload = {
          source_company_id: companyId,
          material_id: item.materialId,
          issued_quantity: String(Math.round(issueQty * 1000) / 1000),
          issued_at: new Date().toISOString(),
          batch_reference: batchNo || '',
          product_reference: `${productName || ''} (${productCode || ''})`,
          remarks: `Auto-issued from Formula Calculator for batch ${batchNo}`,
          idempotency_key: idempotencyKey,
        }
        if (storeUnitId) {
          payload.unit_id = storeUnitId
        }

        const draft = await createMaterialIssue(selectedStoreId, payload)

        // Step 2: Post (DRAFT → POSTED) to actually deduct from inventory
        await postMaterialIssue(selectedStoreId, draft.id, draft.version)

        success.push({
          name: item.name,
          qty: item.targetQty,
          unit: item.unit,
          reference: draft.reference,
        })
      } catch (err) {
        const errMsg = getErrorMessage(err)
        failed.push({ name: item.name, error: errMsg })
      }
    }

    setIssueResults({ success, failed })
    setIssuingToProduction(false)
    setIssueProgress({ current: 0, total: 0, currentItem: '' })

    // Refresh stock balances to show updated inventory
    setStockRefreshCount((c) => c + 1)

    if (failed.length === 0) {
      setActionSuccess(
        `✅ All ${success.length} materials successfully issued to production! ` +
        `Inventory has been updated. Refs: ${success.map((s) => s.reference).join(', ')}`
      )
      setTimeout(() => setActionSuccess(''), 12000)
    } else if (success.length > 0) {
      setActionSuccess(
        `⚠️ Partial success: ${success.length} issued, ${failed.length} failed. ` +
        `Failed: ${failed.map((f) => f.name).join(', ')}`
      )
      setTimeout(() => setActionSuccess(''), 15000)
    } else {
      setRevisionError(
        `❌ All ${failed.length} material issues failed. ` +
        `Errors: ${failed.map((f) => `${f.name}: ${f.error}`).join('; ')}`
      )
    }
  }


  return (
    <div className="prc-container">
      {/* 1. TOP BATCH MASTER SPECIFICATION HEADER */}
      <div className="prc-batch-header-card">
        <div className="prc-header-topbar">
          <div className="prc-header-brand">
            <span className="prc-brand-pill">CYMHP</span>
            <div className="prc-header-titles">
              <div className="prc-header-company">CMHP PRIVATE LIMITED</div>
              <div className="prc-header-dept">Production Division · Oral Liquid & Drops Department · Batch Formulation Master</div>
            </div>
          </div>

          <div className="prc-header-actions">
            {revision ? (
              <span className={`prc-qa-pill prc-qa-${(revision.status || 'draft').toLowerCase()}`}>
                {revision.status === 'APPROVED' && '✅ QA APPROVED · Production Verified'}
                {revision.status === 'SUBMITTED' && '⏳ SUBMITTED FOR QA REVIEW'}
                {(!revision.status || revision.status === 'DRAFT') && '📝 DRAFT FORMULATION'}
              </span>
            ) : (
              <span className="prc-qa-pill prc-qa-draft">📝 DRAFT FORMULATION</span>
            )}
            <div className="prc-header-btn-group">
              <button
                type="button"
                className="prc-btn-subtle"
                onClick={handleLoadSavedRevision}
                title="Reload materials directly from the saved revision in database"
              >
                🔄 Reset from Revision
              </button>
              <button
                type="button"
                className="prc-btn-subtle"
                onClick={handleApplyExcelTemplate}
                title="Load 10-liquid Excel Master template (3L / 9L)"
              >
                📋 Load Excel Master
              </button>
            </div>
          </div>
        </div>

        {actionSuccess && (
          <Alert type="success" style={{ margin: '12px 0 0' }}>
            {actionSuccess}
          </Alert>
        )}
        {revisionError && (
          <Alert type="error" style={{ margin: '12px 0 0' }}>
            {revisionError}
          </Alert>
        )}

        {/* BATCH & PRODUCT METADATA SECTION */}
        <div className="prc-meta-layout">
          {/* LEFT: Product & Company Specification */}
          <div className="prc-meta-grid-side">
            <div className="prc-meta-cell prc-meta-cell-wide">
              <label>Product Name</label>
              <input
                className="prc-input prc-input-bold"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. PREGACURE DROP"
              />
            </div>
            <div className="prc-meta-cell">
              <label>Product Code</label>
              <input
                className="prc-input"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                placeholder="e.g. GER/06"
              />
            </div>
            <div className="prc-meta-cell">
              <label>Pack Size</label>
              <div className="prc-input-with-inline-tag">
                <input
                  className="prc-input prc-input-bold"
                  value={packSizeMl}
                  onChange={(e) => setPackSizeMl(e.target.value)}
                />
                <span className="prc-inline-unit-tag">ML</span>
              </div>
            </div>
            <div className="prc-meta-cell prc-meta-cell-wide">
              <label>Company Name</label>
              <input
                className="prc-input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="prc-meta-cell">
              <label>Company Code</label>
              <input
                className="prc-input"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
              />
            </div>
          </div>

          {/* RIGHT: Batch Execution & Target Batch Output */}
          <div className="prc-meta-grid-side">
            <div className="prc-meta-cell">
              <label>Issue Date</label>
              <input
                type="date"
                className="prc-input"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="prc-meta-cell prc-meta-cell-batch">
              <label>Batch No.</label>
              <input
                className="prc-input prc-batch-input-field"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="e.g. AH2602"
              />
            </div>
            <div className="prc-batch-hero-card">
              <div className="prc-bhc-label">Target Batch Volume</div>
              <div className="prc-bhc-val">
                {formatNum(targetVolumeLtr, 2)} <span className="prc-bhc-unit">LTR</span>
              </div>
              <div className="prc-bhc-sub">
                = {formatNum(bottleCount, 0)} Finished Bottles ({packSizeMl}ml)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. BATCH SIZING & FORMULA SCALING ENGINE */}
      <div className="prc-scaling-engine-card">
        <div className="prc-card-header-bar">
          <div className="prc-chb-title">
            <span className="prc-chb-icon">🧮</span>
            <div>
              <h3>Batch Sizing & Scaling Engine</h3>
              <p>Scale formulation ingredients dynamically by target finished bottles or bulk volume.</p>
            </div>
          </div>

          <div className="prc-chb-actions">
            <button
              type="button"
              className="prc-btn-action prc-btn-action-save"
              onClick={handleSaveToRevision}
              disabled={savingRevision}
              title="Permanently save these quantities into Revision Bill of Materials"
            >
              {savingRevision ? 'Saving…' : '💾 Save to Master Revision'}
            </button>
            <button
              type="button"
              className="prc-btn-action prc-btn-action-rm"
              onClick={handlePrintAttachment1}
              title="Print Attachment 1 - RM Requisition Slip"
            >
              📄 RM Slip (Att. 1)
            </button>
            <button
              type="button"
              className="prc-btn-action prc-btn-action-pm"
              onClick={handlePrintAttachment4}
              title="Print Attachment 4 - PM Requirement Slip"
            >
              📦 PM Slip (Att. 4)
            </button>
          </div>
        </div>

        {/* 3-COLUMN SCALING CONTROL DECK */}
        <div className="prc-scaling-deck-grid">
          {/* COLUMN 1: CALCULATION MODE */}
          <div className="prc-deck-box">
            <div className="prc-deck-title">Calculation Mode</div>
            <div className="prc-segmented-control">
              <button
                type="button"
                className={`prc-seg-button ${calcMode === 'BOTTLES' ? 'active' : ''}`}
                onClick={() => setCalcMode('BOTTLES')}
              >
                🍾 By Finished Bottles
              </button>
              <button
                type="button"
                className={`prc-seg-button ${calcMode === 'VOLUME' ? 'active' : ''}`}
                onClick={() => setCalcMode('VOLUME')}
              >
                🧪 By Total Bulk Litres
              </button>
            </div>
            <div className="prc-deck-desc">
              {calcMode === 'BOTTLES'
                ? 'Enter total bottles to calculate required bulk batch litres.'
                : 'Enter target litres to calculate finished pack yield.'}
            </div>
          </div>

          {/* COLUMN 2: TARGET QUANTITY INPUT & AUTO CALCULATION */}
          <div className="prc-deck-box prc-deck-box-target">
            <div className="prc-deck-title">
              {calcMode === 'BOTTLES' ? 'Target Finished Bottles / Packs' : 'Target Bulk Output (Litres)'}
            </div>
            {calcMode === 'BOTTLES' ? (
              <div className="prc-target-input-block">
                <div className="prc-large-input-wrapper">
                  <input
                    type="number"
                    className="prc-hero-input"
                    value={bottleCount}
                    onChange={(e) => setBottleCount(e.target.value)}
                    placeholder="e.g. 3024"
                  />
                  <span className="prc-hero-unit-tag">Bottles</span>
                </div>
                <div className="prc-auto-calc-badge">
                  <span className="prc-acb-icon">⚡</span>
                  <span>Equation: <strong>{formatNum(bottleCount, 0)}</strong> × {packSizeMl}ml = <strong>{formatNum(targetVolumeLtr, 2)} Litres</strong></span>
                </div>
              </div>
            ) : (
              <div className="prc-target-input-block">
                <div className="prc-large-input-wrapper">
                  <input
                    type="number"
                    step="any"
                    className="prc-hero-input"
                    value={targetVolumeLtr}
                    onChange={(e) => handleVolumeChange(e.target.value)}
                    placeholder="e.g. 90"
                  />
                  <span className="prc-hero-unit-tag">Litres</span>
                </div>
                <div className="prc-auto-calc-badge">
                  <span className="prc-acb-icon">⚡</span>
                  <span>Yields approx. <strong>{formatNum(bottleCount, 0)}</strong> finished {packSizeMl}ml bottles</span>
                </div>
              </div>
            )}
          </div>

          {/* COLUMN 3: SCALING RATIO & STANDARD BASE */}
          <div className="prc-deck-box">
            <div className="prc-deck-title">Formula Scaling Ratio</div>
            <div className="prc-scale-stat-flex">
              <div className="prc-scale-hero-pill">
                <div className="prc-shp-val">{scaleMultiplier.toFixed(2)}×</div>
                <div className="prc-shp-lbl">Scale Multiplier</div>
              </div>
              <div className="prc-scale-base-ctrl">
                <label>Formula Standard Base</label>
                <div className="prc-input-with-inline-tag">
                  <input
                    type="number"
                    step="any"
                    className="prc-input prc-input-bold"
                    value={baseBatchLtr}
                    onChange={(e) => setBaseBatchLtr(e.target.value)}
                  />
                  <span className="prc-inline-unit-tag">Litres</span>
                </div>
                <span className="prc-scale-summary-note">{baseBatchLtr}L ➔ {targetVolumeLtr}L batch</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ALCOHOL & VEHICLE MASS BALANCE PANEL (C1V1 = ΣC2V2 NET ENA CALCULATION) */}
      <div className="prc-vehicle-card">
        <div className="prc-card-header-bar">
          <div className="prc-chb-title">
            <span className="prc-chb-icon">⚗️</span>
            <div>
              <h3>Alcohol & Vehicle Mass Balance</h3>
              <p>Mass balance calculation ensuring finished batch alcohol strength (% v/v) and vehicle Q.S.</p>
            </div>
          </div>

          <div className="prc-vh-controls">
            <div className="prc-vh-mode-toggle">
              <button
                type="button"
                className={`prc-vh-mode-btn ${alcCalcMode === 'AUTO' ? 'active' : ''}`}
                onClick={() => setAlcCalcMode('AUTO')}
              >
                ⚡ Auto (% v/v Target)
              </button>
              <button
                type="button"
                className={`prc-vh-mode-btn ${alcCalcMode === 'MANUAL' ? 'active' : ''}`}
                onClick={() => {
                  setAlcCalcMode('MANUAL')
                  if (!manualGrossAlcohol) setManualGrossAlcohol(String(autoGrossAlcoholLtr))
                }}
              >
                ✍️ Manual Gross Alcohol
              </button>
            </div>

            {alcCalcMode === 'AUTO' ? (
              <div className="prc-vh-params-row">
                <div className="prc-param-badge">
                  <span className="prc-pb-label">Target Alcohol:</span>
                  <input
                    type="number"
                    step="any"
                    className="prc-param-num-input"
                    value={targetAlcoholPct}
                    onChange={(e) => setTargetAlcoholPct(e.target.value)}
                  />
                  <span className="prc-pb-unit">% v/v</span>
                </div>
                <div className="prc-param-badge">
                  <span className="prc-pb-label">ENA Strength:</span>
                  <input
                    type="number"
                    step="any"
                    className="prc-param-num-input"
                    value={alcoholStrengthPct}
                    onChange={(e) => setAlcoholStrengthPct(e.target.value)}
                  />
                  <span className="prc-pb-unit">% v/v</span>
                </div>
              </div>
            ) : (
              <div className="prc-vh-params-row">
                <div className="prc-param-badge">
                  <span className="prc-pb-label">Manual Gross Alcohol:</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="prc-param-num-input"
                    value={manualGrossAlcohol}
                    onChange={(e) => setManualGrossAlcohol(e.target.value)}
                    placeholder="0.00"
                    style={{ width: 84 }}
                  />
                  <select
                    className="prc-param-unit-select"
                    value={manualGrossAlcoholUnit}
                    onChange={(e) => setManualGrossAlcoholUnit(e.target.value)}
                  >
                    <option value="lit">Ltr</option>
                    <option value="ML">ML</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="prc-btn-reset-param"
                  onClick={() => {
                    setManualGrossAlcohol(String(autoGrossAlcoholLtr))
                    setManualGrossAlcoholUnit('lit')
                  }}
                >
                  ↺ Reset ({formatNum(autoGrossAlcoholLtr, 2)} L)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4 BALANCED HORIZONTAL PROCESS STEPS */}
        <div className="prc-vehicle-steps-grid">
          {/* STEP 1: GROSS ALCOHOL */}
          <div className="prc-vstep-card prc-vstep-gross">
            <div className="prc-vstep-top">
              <span className="prc-vstep-tag prc-vtag-blue">STEP 1</span>
              <span className="prc-vstep-stage">Theoretical Gross</span>
            </div>
            <div className="prc-vstep-name">Gross Alcohol Required</div>
            <div className="prc-vstep-body">
              <div className="prc-vstep-primary">
                {formatNum(grossAlcoholRequiredLtr, 3)} <span className="prc-vstep-unit">litres</span>
              </div>
              <span className="prc-vstep-pill prc-vpill-blue">
                {formatNum(grossAlcoholRequiredMl, 1)} ML
              </span>
            </div>
            <div className="prc-vstep-foot">
              {alcCalcMode === 'MANUAL'
                ? '✍️ Specified via manual entry'
                : `= ${formatNum(targetVolumeLtr, 2)}L × ${targetAlcoholPct}% ÷ ${alcoholStrengthPct}%`}
            </div>
          </div>

          {/* STEP 2: RAW MATERIAL ALCOHOL DEDUCTION */}
          <div className="prc-vstep-card prc-vstep-rm">
            <div className="prc-vstep-top">
              <span className="prc-vstep-tag prc-vtag-amber">STEP 2</span>
              <span className="prc-vstep-stage">RM Alcohol Credit</span>
            </div>
            <div className="prc-vstep-name" style={{ color: '#b45309' }}>− In Raw Materials</div>
            <div className="prc-vstep-body">
              <div className="prc-vstep-primary prc-text-amber">
                {totalRawMaterialAlcoholLtr > 0.000001 ? `−${formatNum(totalRawMaterialAlcoholLtr, 3)}` : '0.000'}{' '}
                <span className="prc-vstep-unit">litres</span>
              </div>
              <span className="prc-vstep-pill prc-vpill-amber">
                {totalRawMaterialAlcoholLtr > 0.000001 ? `−${formatNum(totalRawMaterialAlcoholMl, 1)} ML` : '0.0 ML'}
              </span>
            </div>
            <div className="prc-vstep-foot prc-text-amber-muted">
              {totalRawMaterialAlcoholLtr > 0.000001
                ? `Credited from ${rawMaterialAlcoholBreakdown.filter((r) => r.alcoholContributionLtr > 0).length} active herbal tincture(s)`
                : 'No alcohol present in active raw materials'}
            </div>
          </div>

          {/* STEP 3: NET ENA TO ADD (PRIMARY DISPENSE) */}
          <div className="prc-vstep-card prc-vstep-dispense">
            <div className="prc-vstep-top">
              <span className="prc-vstep-tag prc-vtag-indigo">STEP 3</span>
              <span className="prc-vstep-stage">Dispense to Batch</span>
            </div>
            <div className="prc-vstep-name prc-text-indigo">⚗️ Net ENA / RS to Add</div>
            <div className="prc-vstep-body">
              <div className="prc-vstep-primary prc-text-indigo">
                {formatNum(netAlcoholRequiredLtr, 3)} <span className="prc-vstep-unit">litres</span>
              </div>
              <span className="prc-vstep-pill prc-vpill-indigo">
                {formatNum(netAlcoholRequiredMl, 1)} ML
              </span>
            </div>
            <div className="prc-vstep-foot">
              (= {formatNum(grossAlcoholRequiredLtr, 3)}L Gross − {formatNum(totalRawMaterialAlcoholLtr, 3)}L in RMs)
            </div>
          </div>

          {/* STEP 4: WATER REQUIRED (Q.S.) */}
          <div className="prc-vstep-card prc-vstep-water">
            <div className="prc-vstep-top">
              <span className="prc-vstep-tag prc-vtag-emerald">STEP 4</span>
              <span className="prc-vstep-stage">Vehicle (Q.S.)</span>
            </div>
            <div className="prc-vstep-name prc-text-emerald">💧 Purified Water (Q.S.)</div>
            <div className="prc-vstep-body">
              <div className="prc-vstep-primary prc-text-emerald">
                {formatNum(waterRequiredLtr, 3)} <span className="prc-vstep-unit">litres</span>
              </div>
              <span className="prc-vstep-pill prc-vpill-emerald">
                {formatNum(waterRequiredMl, 1)} ML
              </span>
            </div>
            <div className="prc-vstep-foot prc-text-emerald-muted">
              = Batch ({formatNum(targetVolumeLtr, 2)}L) − RMs ({formatNum(totalLiquidRmVolumeLtr, 3)}L) − Net ENA ({formatNum(netAlcoholRequiredLtr, 3)}L)
            </div>
          </div>
        </div>
      </div>

      {/* 4. ACTIVE RAW MATERIALS COMPOSITION TABLE */}
      <div className="prc-table-card">
        <div className="prc-card-header-bar">
          <div className="prc-chb-title">
            <span className="prc-chb-icon">🧪</span>
            <div>
              <h3>Active Dilutions & Ingredients (Section 1)</h3>
              <p>
                {compositions.length} active raw material{compositions.length === 1 ? '' : 's'} for <strong>{productName}</strong>. Base {baseBatchLtr}L formula scaled by <strong>{scaleMultiplier.toFixed(2)}×</strong> for {targetVolumeLtr}L batch.
              </p>
            </div>
          </div>
          <div className="prc-table-actions-cluster">
            <div className="prc-store-selector-pill">
              <span className="prc-ssp-icon">🏢</span>
              <span className="prc-ssp-lbl">Store:</span>
              <select
                className="prc-ssp-select"
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                disabled={!stores.length}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="prc-btn-pill prc-btn-pill-amber"
              onClick={() => handleSetTincturesAlcohol(60)}
              title="Set all Mother Tinctures (Q) to standard 60% alcohol content"
            >
              🧪 Set Q Tinctures to 60% Alc
            </button>
            <button
              type="button"
              className="prc-btn-pill prc-btn-pill-emerald"
              onClick={handleApplyExcelTemplate}
              title="Reset quantities to standard Excel base ratio"
            >
              ⚡ Set All to 3 Lit / 9 Lit
            </button>
            <button type="button" className="prc-btn-pill prc-btn-pill-primary" onClick={addCompRow}>
              + Add Composition Line
            </button>
          </div>
        </div>

        {/* INVENTORY VERIFICATION BANNER (WITH DIRECT PO & INVENTORY LINKS) */}
        <div style={{ padding: '0 20px 14px' }}>
          {!stockSummary.allInStock ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
              border: '1px solid #fecdd3',
              borderLeft: '4px solid #e11d48',
              padding: '14px 18px',
              borderRadius: 10,
              color: '#9f1239',
              fontSize: 13,
              flexWrap: 'wrap',
              boxShadow: '0 2px 6px rgba(225, 29, 72, 0.06)'
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 280 }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#fee2e2',
                  color: '#e11d48',
                  fontSize: 16,
                  fontWeight: 900,
                  flexShrink: 0
                }}>
                  ⚠
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: '#881337' }}>
                    Cannot proceed: {stockSummary.shortageCount} raw material{stockSummary.shortageCount > 1 ? 's are' : ' is'} not available in inventory
                  </div>
                  <div style={{ marginTop: 2, color: '#9f1239', fontSize: 12 }}>
                    <strong>{stockSummary.list.length - stockSummary.shortageCount} of {stockSummary.list.length}</strong> in stock. Missing: {stockSummary.shortages.map(s => `${s.name} (${s.diff.toFixed(2)} ${s.unit})`).join(', ')}.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleOpenPoForShortages}
                  style={{
                    background: 'linear-gradient(135deg, #e11d48, #be123c)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 3px 10px rgba(225, 29, 72, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Generate Purchase Order pre-filled with all shortage items"
                >
                  <span>🛒</span> + Create Purchase Order ({stockSummary.shortageCount} items)
                </button>
                <Link
                  to="/inventory/orders"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: '#ffffff',
                    color: '#be123c',
                    border: '1.5px solid #fecdd3',
                    borderRadius: 8,
                    padding: '7px 14px',
                    fontWeight: 700,
                    fontSize: 12.5,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                  title="Open Purchasing & Purchase Orders page in new tab"
                >
                  📋 Purchasing Hub ↗
                </Link>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              border: '1px solid #bbf7d0',
              borderLeft: '4px solid #16a34a',
              padding: '14px 18px',
              borderRadius: 10,
              color: '#166534',
              fontSize: 12.5,
              flexWrap: 'wrap',
              boxShadow: '0 2px 6px rgba(22, 163, 74, 0.06)'
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 280 }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#dcfce7',
                  color: '#16a34a',
                  fontSize: 16,
                  fontWeight: 900,
                  flexShrink: 0
                }}>✓</span>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    All {stockSummary.list.length} raw materials are verified in stock.
                  </div>
                  <div style={{ marginTop: 2, color: '#14532d' }}>
                    Inventory availability confirmed. Sufficient recorded balance for this {targetVolumeLtr} LTR ({totalBottles.toLocaleString()} bottles) batch.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleOpenIssueConfirm}
                  disabled={issuingToProduction}
                  style={{
                    background: issuingToProduction
                      ? 'linear-gradient(135deg, #9ca3af, #6b7280)'
                      : 'linear-gradient(135deg, #16a34a, #15803d)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 20px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: issuingToProduction ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    boxShadow: issuingToProduction
                      ? 'none'
                      : '0 3px 12px rgba(22, 163, 74, 0.35)',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                  title="Create Material Issues for all raw materials and deduct from inventory"
                >
                  {issuingToProduction ? (
                    <>
                      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                      Issuing {issueProgress.current}/{issueProgress.total}... ({issueProgress.currentItem})
                    </>
                  ) : (
                    <>
                      <span>🚀</span> Issue All to Production
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="prc-table-scroll">
          <table className="prc-table">
            <thead>
              <tr>
                <th style={{ width: 35 }}>Sr.</th>
                <th>Composition (Raw Material Name)</th>
                <th style={{ width: 75 }}>Potency</th>
                <th style={{ width: 90, textAlign: 'right' }}>
                  Base Qty ({baseBatchLtr}L)
                </th>
                <th style={{ width: 95, textAlign: 'right', background: '#e0f2fe', color: '#0369a1' }}>
                  Target Qty ({targetVolumeLtr}L)
                </th>
                <th style={{ width: 60 }}>Unit</th>
                <th style={{ width: 75, textAlign: 'center' }}>Alcohol %</th>
                <th style={{ width: 115, textAlign: 'right', background: '#fef3c7', color: '#92400e' }}>
                  Alcohol Content
                </th>
                <th style={{ width: 105, textAlign: 'right' }}>Available</th>
                <th style={{ width: 100, textAlign: 'center' }}>Stock Status</th>
                <th style={{ width: 80 }}>AR. No.</th>
                <th style={{ width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {compositions.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                    No raw materials loaded for this formula yet. Click <strong>+ Add Composition Line</strong> to add ingredients.
                  </td>
                </tr>
              ) : (
                compositions.map((row, idx) => {
                  const targetQty = Number((Number(row.baseQty) * scaleMultiplier).toFixed(2))
                  const stockInfo = stockBalances[row.id]
                  const avail = stockInfo ? stockInfo.totalAvail : 0
                  const rawAvail = stockInfo ? stockInfo.rawAvail : 0
                  const storeUnit = stockInfo ? stockInfo.storeUnit : row.unit
                  const isShort = avail < targetQty
                  const diff = Math.max(0, targetQty - avail)

                  // Alcohol contribution calculation for this row
                  const rowAlcPct = Number(row.alcoholPct) || 0
                  const rowTargetQtyLtr = convertQuantity(targetQty, row.unit, 'lit')
                  const rowTargetQtyMl = convertQuantity(targetQty, row.unit, 'ml')
                  const rowAlcContributedLtr = Math.round(((rowTargetQtyLtr * rowAlcPct) / 100) * 10000) / 10000
                  const rowAlcContributedMl = Math.round(((rowTargetQtyMl * rowAlcPct) / 100) * 100) / 100

                  return (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            className="prc-cell-input"
                            list="catalog-raw-materials"
                            value={row.name}
                            onChange={(e) => updateComp(row.id, 'name', e.target.value)}
                            placeholder="Type or select material from catalog..."
                          />
                          {isTwoPart && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                whiteSpace: 'nowrap',
                                background: row.part === 2 ? '#faf5ff' : '#eff6ff',
                                color: row.part === 2 ? '#7e22ce' : '#1d4ed8',
                                border: row.part === 2 ? '1px solid #e9d5ff' : '1px solid #bfdbfe',
                              }}
                            >
                              {row.part === 2 ? 'Part-2' : 'Part-1'}
                            </span>
                          )}
                        </div>
                      </td>
                    <td>
                      <input
                        className="prc-cell-input"
                        value={row.potency}
                        onChange={(e) => updateComp(row.id, 'potency', e.target.value)}
                        placeholder="e.g. 200, 1M, Q"
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        step="any"
                        className="prc-cell-input prc-cell-num"
                        value={row.baseQty}
                        onChange={(e) => updateComp(row.id, 'baseQty', e.target.value)}
                        title={`Base quantity for ${baseBatchLtr}L batch (e.g. 3)`}
                      />
                    </td>
                    <td style={{ textAlign: 'right', background: '#f0f9ff' }}>
                      <input
                        type="number"
                        step="any"
                        className="prc-cell-input prc-cell-num"
                        style={{ fontWeight: 700, color: '#0284c7' }}
                        value={targetQty.toFixed(2)}
                        onChange={(e) => updateCompTarget(row.id, e.target.value)}
                        title={`Target quantity for ${targetVolumeLtr}L batch (e.g. 9.00)`}
                      />
                    </td>
                    <td>
                      <select
                        className="prc-cell-select"
                        value={row.unit}
                        onChange={(e) => updateComp(row.id, 'unit', e.target.value)}
                      >
                        <option value="lit">lit</option>
                        <option value="ML">ML</option>
                        <option value="Gm">Gm</option>
                        <option value="KG">KG</option>
                        <option value="NOS">NOS</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          className="prc-cell-input prc-cell-num"
                          style={{ width: 48, textAlign: 'right', fontWeight: 600 }}
                          value={row.alcoholPct !== undefined && row.alcoholPct !== null ? row.alcoholPct : ''}
                          onChange={(e) => updateComp(row.id, 'alcoholPct', e.target.value)}
                          placeholder="0"
                          title="Alcohol percentage (% v/v) of this raw material (e.g. 60% for Q tinctures)"
                        />
                        <span style={{ fontSize: 10.5, color: '#64748b' }}>%</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', background: rowAlcContributedLtr > 0 ? '#fefce8' : undefined }}>
                      {rowAlcContributedLtr > 0 ? (
                        <div>
                          <div style={{ fontWeight: 700, color: '#b45309', fontSize: 12 }}>
                            {row.unit?.toLowerCase() === 'ml'
                              ? `${rowAlcContributedMl.toFixed(2)} ML`
                              : `${rowAlcContributedLtr.toFixed(3)} L`}
                          </div>
                          <div style={{ fontSize: 10, color: '#92400e' }}>
                            ({row.unit?.toLowerCase() === 'ml'
                              ? `${rowAlcContributedLtr.toFixed(4)} L`
                              : `${rowAlcContributedMl.toFixed(1)} ML`})
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 11 }}>0.00 ML (0%)</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: !row.name || !row.name.trim() ? '#94a3b8' : isShort ? '#b91c1c' : '#15803d' }}>
                      {!row.name || !row.name.trim() ? (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                      ) : stockLoading ? (
                        '...'
                      ) : (
                        <div>
                          <div>{avail.toFixed(2)} {row.unit}</div>
                          {stockInfo && stockInfo.hasRecord && stockInfo.storeUnit && stockInfo.storeUnit.toLowerCase() !== row.unit.toLowerCase() && (
                            <div style={{ fontSize: 10.5, color: '#64748b' }}>
                              ({rawAvail.toFixed(2)} {storeUnit} in store)
                            </div>
                          )}
                          {stockInfo && !stockInfo.hasRecord && (
                            <div style={{ fontSize: 10.5, color: '#ef4444' }}>
                              (0 {storeUnit} in store)
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!row.name || !row.name.trim() ? (
                        <span style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>Select material</span>
                      ) : isShort ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <span className="prc-stock-short">
                            ⚠ Short: {diff.toFixed(2)} {row.unit}
                          </span>
                          <button
                            type="button"
                            className="prc-btn-mini-po"
                            onClick={() => handleOpenPoForRow(row, diff)}
                            title={`Create Purchase Order for ${diff.toFixed(2)} ${row.unit} of ${row.name}`}
                          >
                            + Raise PO
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span className="prc-stock-in">
                            ✓ In Stock
                          </span>
                          <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>
                            Ready for batch
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <input
                        className="prc-cell-input"
                        placeholder="AR. No."
                        value={row.ar_no || ''}
                        onChange={(e) => updateComp(row.id, 'ar_no', e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="prc-btn-del"
                        onClick={() => removeRow(row.id, false)}
                        title="Remove row"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              }))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                <td colSpan={3} style={{ textAlign: 'right', padding: '8px 10px', color: '#475569' }}>
                  Total Active Raw Materials:
                </td>
                <td style={{ textAlign: 'right', padding: '8px 6px', color: '#334155' }}>
                  {formatNum(totalActiveBaseQty, 2)}
                </td>
                <td style={{ textAlign: 'right', padding: '8px 6px', color: '#0284c7' }}>
                  {formatNum(totalActiveTargetQty, 2)}
                </td>
                <td></td>
                <td style={{ textAlign: 'center', fontSize: 10.5, color: '#64748b' }}>
                  Total RM Alc:
                </td>
                <td style={{ textAlign: 'right', padding: '8px 6px', background: '#fef3c7' }}>
                  <div style={{ fontWeight: 800, color: '#b45309', fontSize: 12.5 }}>
                    {formatNum(totalRawMaterialAlcoholLtr, 3)} L
                  </div>
                  <div style={{ fontSize: 10.5, color: '#92400e' }}>
                    ({formatNum(totalRawMaterialAlcoholMl, 1)} ML)
                  </div>
                </td>
                <td colSpan={4} style={{ padding: '8px 10px', fontSize: 11.5, color: '#0369a1' }}>
                  ⚡ Deducted from Gross Alcohol (Net ENA to Add: <strong>{formatNum(netAlcoholRequiredLtr, 3)} L / {formatNum(netAlcoholRequiredMl, 1)} ML</strong>)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 5. PRESERVATIVES & EXCIPIENTS TABLE (EXCEL LOWER SECTION) */}
      <div className="prc-table-card">
        <div className="prc-table-title-row">
          <div>
            <h4>🌿 Preservatives & Excipients (Section 2)</h4>
            <p>Solid and liquid excipients to be deducted from store and added to batch formula ({preservatives.length} item{preservatives.length === 1 ? '' : 's'}).</p>
          </div>
          <button type="button" className="prc-btn-add" onClick={addPresRow}>
            + Add Preservative / Excipient
          </button>
        </div>

        <div className="prc-table-scroll">
          <table className="prc-table">
            <thead>
              <tr>
                <th style={{ width: 35 }}>Sr.</th>
                <th>Preservative / Excipient Name</th>
                <th style={{ width: 85 }}>Potency / Spec</th>
                <th style={{ width: 95, textAlign: 'right' }}>
                  Base Qty ({baseBatchLtr}L)
                </th>
                <th style={{ width: 100, textAlign: 'right', background: '#fef3c7', color: '#b45309' }}>
                  Target Qty ({targetVolumeLtr}L)
                </th>
                <th style={{ width: 65 }}>Unit</th>
                <th style={{ width: 110, textAlign: 'right' }}>Available in Store</th>
                <th style={{ width: 105, textAlign: 'center' }}>Stock Status</th>
                <th style={{ width: 85 }}>AR. No.</th>
                <th style={{ width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {preservatives.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '18px', color: '#64748b', fontSize: 12 }}>
                    No excipients or preservatives in this formula. Click <strong>+ Add Preservative / Excipient</strong> if this batch requires excipients to be deducted from inventory.
                  </td>
                </tr>
              ) : (
                preservatives.map((row, idx) => {
                  const targetQty = Number((Number(row.baseQty) * scaleMultiplier).toFixed(2))
                  const stockInfo = stockBalances[row.id]
                  const avail = stockInfo ? stockInfo.totalAvail : 0
                  const rawAvail = stockInfo ? stockInfo.rawAvail : 0
                  const storeUnit = stockInfo ? stockInfo.storeUnit : row.unit
                  const isShort = avail < targetQty
                  const diff = Math.max(0, targetQty - avail)

                  return (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td>
                        <input
                          className="prc-cell-input"
                          list="catalog-raw-materials"
                          value={row.name}
                          onChange={(e) => updatePres(row.id, 'name', e.target.value)}
                          placeholder="Type or select excipient from catalog..."
                        />
                      </td>
                    <td>
                      <input
                        className="prc-cell-input"
                        value={row.potency}
                        onChange={(e) => updatePres(row.id, 'potency', e.target.value)}
                        placeholder="Grade / Potency"
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        step="any"
                        className="prc-cell-input prc-cell-num"
                        value={row.baseQty}
                        onChange={(e) => updatePres(row.id, 'baseQty', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'right', background: '#fffbeb' }}>
                      <input
                        type="number"
                        step="any"
                        className="prc-cell-input prc-cell-num"
                        style={{ fontWeight: 700, color: '#b45309' }}
                        value={targetQty.toFixed(2)}
                        onChange={(e) => updatePresTarget(row.id, e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="prc-cell-select"
                        value={row.unit}
                        onChange={(e) => updatePres(row.id, 'unit', e.target.value)}
                      >
                        <option value="Gm">Gm</option>
                        <option value="KG">KG</option>
                        <option value="lit">lit</option>
                        <option value="ML">ML</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: !row.name || !row.name.trim() ? '#94a3b8' : isShort ? '#b91c1c' : '#15803d' }}>
                      {!row.name || !row.name.trim() ? (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                      ) : stockLoading ? (
                        '...'
                      ) : (
                        <div>
                          <div>{avail.toFixed(2)} {row.unit}</div>
                          {stockInfo && stockInfo.hasRecord && stockInfo.storeUnit && stockInfo.storeUnit.toLowerCase() !== row.unit.toLowerCase() && (
                            <div style={{ fontSize: 10.5, color: '#64748b' }}>
                              ({rawAvail.toFixed(2)} {storeUnit} in store)
                            </div>
                          )}
                          {stockInfo && !stockInfo.hasRecord && (
                            <div style={{ fontSize: 10.5, color: '#ef4444' }}>
                              (0 {storeUnit} in store)
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!row.name || !row.name.trim() ? (
                        <span style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>Select material</span>
                      ) : isShort ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <span className="prc-stock-short">
                            ⚠ Short: {diff.toFixed(2)} {row.unit}
                          </span>
                          <button
                            type="button"
                            className="prc-btn-mini-po"
                            onClick={() => handleOpenPoForRow(row, diff)}
                            title={`Create Purchase Order for ${diff.toFixed(2)} ${row.unit} of ${row.name}`}
                          >
                            + Raise PO
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span className="prc-stock-in">
                            ✓ In Stock
                          </span>
                          <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>
                            Ready for batch
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <input
                        className="prc-cell-input"
                        placeholder="AR. No."
                        value={row.ar_no || ''}
                        onChange={(e) => updatePres(row.id, 'ar_no', e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="prc-btn-del"
                        onClick={() => removeRow(row.id, true)}
                        title="Remove row"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              }))}
              {/* Alcohol and Water lines rendered as part of vehicle */}
              {(() => {
                const alcStockInfo = stockBalances['alc']
                const alcAvail = alcStockInfo ? alcStockInfo.totalAvail : 0
                const alcRawAvail = alcStockInfo ? alcStockInfo.rawAvail : 0
                const alcStoreUnit = alcStockInfo ? alcStockInfo.storeUnit : 'LTR'
                const alcShort = alcAvail < alcoholRequiredLtr
                const alcDiff = Math.max(0, alcoholRequiredLtr - alcAvail)

                // Net alcohol check: compare net ENA required vs stock
                const netAlcShort = alcAvail < netAlcoholRequiredLtr
                const netAlcDiff = Math.max(0, netAlcoholRequiredLtr - alcAvail)
                return (
                  <>
                    {/* If raw materials contribute alcohol — show deduction info row */}
                    {totalRawMaterialAlcoholLtr > 0 && (
                      <tr style={{ background: '#fffbeb', fontStyle: 'italic' }}>
                        <td>—</td>
                        <td style={{ color: '#92400e', fontSize: 12 }} colSpan={3}>
                          ⚗ Alcohol already in raw materials (C₁V₁ = Σ C₂V₂ deduction):
                          {' '}{rawMaterialAlcoholBreakdown.map((r, i) => (
                            <span key={r.id}>
                              {i > 0 ? ', ' : ''}{r.name} ({r.alcoholPct}% × {r.targetQtyLtr.toFixed(3)} L = {r.alcoholContributionLtr.toFixed(4)} L)
                            </span>
                          ))}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#d97706' }}>−{totalRawMaterialAlcoholLtr.toFixed(3)}</td>
                        <td>litres</td>
                        <td colSpan={4} style={{ fontSize: 11, color: '#92400e' }}>Deducted from gross alcohol requirement</td>
                      </tr>
                    )}
                    <tr style={{ background: '#f0f9ff', fontWeight: 600 }}>
                      <td>—</td>
                      <td style={{ color: '#0369a1' }}>
                        {totalRawMaterialAlcoholLtr > 0
                          ? `⚗ Net ENA / RS Required (${alcoholStrengthPct}% V/V) — after deduction`
                          : `Alcohol Required (${alcoholStrengthPct}% V/V Dispensing Alcohol)`
                        }
                      </td>
                      <td style={{ fontSize: 11 }}>{targetAlcoholPct}% Finished</td>
                      <td style={{ textAlign: 'right' }}>
                        {totalRawMaterialAlcoholLtr > 0
                          ? (netAlcoholRequiredLtr / scaleMultiplier).toFixed(3)
                          : (alcoholRequiredLtr / scaleMultiplier).toFixed(3)
                        }
                      </td>
                      <td style={{ textAlign: 'right', color: '#0369a1', fontWeight: 700 }}>
                        {totalRawMaterialAlcoholLtr > 0
                          ? netAlcoholRequiredLtr.toFixed(3)
                          : alcoholRequiredLtr.toFixed(3)
                        }
                      </td>
                      <td>litres</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: (totalRawMaterialAlcoholLtr > 0 ? netAlcShort : alcShort) ? '#b91c1c' : '#15803d' }}>
                        <div>{alcAvail.toFixed(2)} LTR</div>
                        {alcStockInfo && alcStockInfo.hasRecord && alcStoreUnit.toLowerCase() !== 'ltr' && (
                          <div style={{ fontSize: 10.5, color: '#64748b' }}>
                            ({alcRawAvail.toFixed(2)} {alcStoreUnit} in store)
                          </div>
                        )}
                        {alcStockInfo && !alcStockInfo.hasRecord && (
                          <div style={{ fontSize: 10.5, color: '#ef4444' }}>
                            (0 {alcStoreUnit} in store)
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {(totalRawMaterialAlcoholLtr > 0 ? netAlcShort : alcShort) ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <span className="prc-stock-short">
                              ⚠ Short: {(totalRawMaterialAlcoholLtr > 0 ? netAlcDiff : alcDiff).toFixed(2)} LTR
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <span className="prc-stock-in">
                              ✓ In Stock
                            </span>
                            <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>
                              Ready for batch
                            </span>
                          </div>
                        )}
                      </td>
                      <td>—</td>
                      <td></td>
                    </tr>
                  </>
                )
              })()}
              <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                <td>—</td>
                <td style={{ color: '#0369a1' }}>Purified Water Required (DM Water)</td>
                <td>Q.S.</td>
                <td style={{ textAlign: 'right' }}>{(waterRequiredLtr / scaleMultiplier).toFixed(3)}</td>
                <td style={{ textAlign: 'right', color: '#0369a1', fontWeight: 700 }}>{waterRequiredLtr.toFixed(3)}</td>
                <td>litres</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#334155' }}>Available</td>
                <td style={{ textAlign: 'center' }}>
                  <span className="prc-stock-in">
                    ✓ In Stock
                  </span>
                </td>
                <td>—</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. PACKAGING MATERIAL REQUIREMENTS (ATTACHMENT 4 PREVIEW) */}
      <div className="prc-table-card">
        <div className="prc-table-title-row">
          <div>
            <h4>📦 Packaging Material Requirement (Attachment - 4 Preview)</h4>
            <p>Calculated for {totalBottles.toLocaleString()} finished units of {packSizeMl}ml.</p>
          </div>
          <button
            type="button"
            className="prc-btn-slip prc-btn-pm"
            onClick={handlePrintAttachment4}
            style={{ padding: '6px 14px', fontSize: 13 }}
          >
            📦 Open PM Slip (Att. 4)
          </button>
        </div>

        <div className="prc-table-scroll">
          <table className="prc-table">
            <thead>
              <tr>
                <th style={{ width: 45 }}>Sr.</th>
                <th>Packing Material Name</th>
                <th style={{ width: 140, textAlign: 'right' }}>Quantity Required</th>
                <th style={{ width: 70 }}>Unit</th>
                <th style={{ width: 130, textAlign: 'right' }}>Available in Store</th>
                <th style={{ width: 130, textAlign: 'center' }}>Stock Status</th>
                <th style={{ width: 110 }}>AR / Lot No.</th>
              </tr>
            </thead>
            <tbody>
              {packagingLines.map((pkg, idx) => {
                const stockInfo = stockBalances[pkg.id]
                const avail = stockInfo ? stockInfo.totalAvail : 0
                const rawAvail = stockInfo ? stockInfo.rawAvail : 0
                const storeUnit = stockInfo ? stockInfo.storeUnit : pkg.unit
                const hasRecord = stockInfo ? stockInfo.hasRecord : false
                const isShort = hasRecord && avail < pkg.qty
                const diff = Math.max(0, pkg.qty - avail)

                return (
                  <tr key={pkg.id || `pkg-${idx}`}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{pkg.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#0369a1' }}>
                      {pkg.qty.toLocaleString()}
                    </td>
                    <td>{pkg.unit}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {stockLoading ? (
                        '...'
                      ) : !hasRecord ? (
                        <span style={{ color: '#94a3b8', fontSize: 11 }}>0 {pkg.unit} in store</span>
                      ) : (
                        <div>
                          <div style={{ color: isShort ? '#b91c1c' : '#15803d' }}>
                            {avail.toLocaleString()} {pkg.unit}
                          </div>
                          {storeUnit.toLowerCase() !== pkg.unit.toLowerCase() && (
                            <div style={{ fontSize: 10, color: '#64748b' }}>
                              ({rawAvail.toLocaleString()} {storeUnit})
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!hasRecord ? (
                        <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600 }}>
                          ⚠ Not in store
                        </span>
                      ) : isShort ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span className="prc-stock-short" style={{ fontSize: 11, padding: '2px 6px' }}>
                            ⚠ Short: {diff.toLocaleString()} {pkg.unit}
                          </span>
                          <button
                            type="button"
                            className="prc-btn-mini-po"
                            onClick={() => handleOpenPoForRow({ ...pkg, targetQty: pkg.qty, isPackaging: true }, diff)}
                            title={`Create Purchase Order for ${diff} ${pkg.unit} of ${pkg.name}`}
                          >
                            + Raise PO
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span className="prc-stock-in" style={{ fontSize: 11, padding: '2px 6px' }}>
                            ✓ In Stock
                          </span>
                          <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>
                            Ready for batch
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ color: '#94a3b8' }}>{pkg.ar_no || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6B. BATCH YIELD, QC & RETENTION SAMPLES & SALES ORDER ALLOCATION SPLIT */}
      <div className="prc-table-card prc-yield-card" style={{ border: '1.5px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div className="prc-table-title-row" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>📦</span>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                Batch Output Allocation, Quality Samples & Stock Split
              </h4>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 6, border: '1px solid #bae6fd' }}>
                GMP Reconciliation
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
              Deduct QC testing & control/retention samples, then allocate net commercial bottles between current sales order and future free buffer stock.
            </p>
          </div>
        </div>

        {/* 3-METRIC SUMMARY BANNER */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          padding: '16px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🏭 Total Batch Gross Yield
            </span>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              {totalBottles.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>bottles ({targetVolumeLtr} L)</span>
            </div>
          </div>

          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '12px 16px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🧪 Total Samples Withdrawn
            </span>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#e11d48', marginTop: 4 }}>
              -{totalSamplesNum.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 600, color: '#be123c' }}>bottles (QC + Retention)</span>
            </div>
          </div>

          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              ✅ Net Commercial Output
            </span>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
              {netCommercialBottles.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>bottles</span>
            </div>
          </div>
        </div>

        {/* 2-COLUMN CONFIGURATION GRID */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
          padding: '20px',
        }}>
          {/* COLUMN 1: SAMPLES MANAGEMENT */}
          <div style={{
            background: '#ffffff',
            border: '1.5px solid #e2e8f0',
            borderRadius: 12,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🧪</span>
              <div>
                <h5 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                  1. Quality & Regulatory Samples (Deductions)
                </h5>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Withdrawn from batch before commercial release
                </span>
              </div>
            </div>

            {/* QC Sample Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  🔬 QC Laboratory Testing Samples
                </label>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Assay, DT, Sterility & pH testing (Consumed in Lab)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  className="prc-cell-input prc-cell-num"
                  style={{ width: 80, textAlign: 'right', fontWeight: 700, padding: '6px 8px', borderRadius: 6, border: '1.5px solid #cbd5e1' }}
                  value={qcSampleQty}
                  onChange={(e) => setQcSampleQty(e.target.value)}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>BTL</span>
              </div>
            </div>

            {/* Retention Sample Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  🏷️ Control / Retention Samples
                </label>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Stored in Control Room until Expiry + 1 Year (Drug Rules audit)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  className="prc-cell-input prc-cell-num"
                  style={{ width: 80, textAlign: 'right', fontWeight: 700, padding: '6px 8px', borderRadius: 6, border: '1.5px solid #cbd5e1' }}
                  value={retentionSampleQty}
                  onChange={(e) => setRetentionSampleQty(e.target.value)}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>BTL</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, fontSize: 11.5, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Total Withdrawn to Samples:</span>
              <strong style={{ color: '#e11d48', fontSize: 13 }}>{totalSamplesNum} Bottles</strong>
            </div>

            {retentionSampleNum > 0 && (
              <button
                type="button"
                onClick={handleLogToControlSampleRegister}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: '0 2px 4px rgba(124, 58, 237, 0.2)',
                }}
              >
                📋 Log {retentionSampleNum} Samples to Control Room Register
              </button>
            )}
          </div>

          {/* COLUMN 2: SALES ORDER ALLOCATION & BUFFER STOCK SPLIT */}
          <div style={{
            background: '#ffffff',
            border: '1.5px solid #e2e8f0',
            borderRadius: 12,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🎯</span>
              <div>
                <h5 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                  2. Commercial Output Allocation Split
                </h5>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Allocate net {netCommercialBottles.toLocaleString()} bottles to Order vs Warehouse Buffer
                </span>
              </div>
            </div>

            {/* Sales Order Input */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b' }}>
                  🎯 Primary Sales Order Allocation:
                </label>
                {orderAllocatedNum > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 4 }}>
                    🔒 Reserved for Dispatch
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
                <input
                  className="prc-cell-input"
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 12 }}
                  placeholder="e.g. SO-2026-1024 / Apollo Hospitals Bulk"
                  value={linkedSalesOrder}
                  onChange={(e) => setLinkedSalesOrder(e.target.value)}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min="0"
                    max={netCommercialBottles}
                    className="prc-cell-input prc-cell-num"
                    style={{ width: '100%', textAlign: 'right', fontWeight: 700, padding: '6px 8px', borderRadius: 6, border: '1.5px solid #cbd5e1' }}
                    placeholder={String(netCommercialBottles)}
                    value={orderAllocatedQty}
                    onChange={(e) => setOrderAllocatedQty(e.target.value)}
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>BTL</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Directly reserved for this customer order upon batch completion.
              </div>
            </div>

            {/* General Buffer Stock Result */}
            <div style={{
              background: bufferStockNum > 0 ? '#f0fdf4' : '#f8fafc',
              border: `1.5px solid ${bufferStockNum > 0 ? '#86efac' : '#e2e8f0'}`,
              borderRadius: 8,
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: bufferStockNum > 0 ? '#166534' : '#64748b', display: 'block' }}>
                    🏬 General Warehouse Buffer (Free Stock):
                  </span>
                  <span style={{ fontSize: 11, color: bufferStockNum > 0 ? '#15803d' : '#94a3b8' }}>
                    Available for next incoming orders without re-manufacturing
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: bufferStockNum > 0 ? '#16a34a' : '#64748b' }}>
                    {bufferStockNum.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>BTL</span>
                </div>
              </div>

              {bufferStockNum > 0 && (
                <>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #bbf7d0', fontSize: 10.5, color: '#166534', fontWeight: 600 }}>
                    💡 {bufferStockNum.toLocaleString()} bottles will stay in Finished Goods inventory ready for the next customer order.
                  </div>
                  <button
                    type="button"
                    onClick={handleInwardBufferToFgWarehouse}
                    style={{
                      background: 'linear-gradient(135deg, #16a34a, #15803d)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      marginTop: 8,
                      width: '100%',
                      boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)',
                    }}
                  >
                    🏭 Inward {bufferStockNum.toLocaleString()} Bottles to FG Warehouse Store
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 7. MANUFACTURING NOTES & FOOTER INSTRUCTIONS */}
      <div className="prc-notes-card">
        <h4>📝 Manufacturing Notes</h4>
        <textarea
          className="prc-notes-textarea"
          rows={3}
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
          placeholder="Enter dissolving, mixing, temperature or SOP instructions..."
        />
        <p className="prc-notes-hint">
          ℹ️ Appears on BMR Attachment 1 (RM Slip) & Attachment 4 (PM Slip).
        </p>
      </div>

      {/* 8. FOOTER ACTIONS BAR */}
      <div className="prc-bottom-bar">
        <div className="prc-bottom-left">
          <span className="prc-dot-green"></span>
          <span>Batch: <strong>{targetVolumeLtr} LTR</strong> &nbsp;·&nbsp; <strong>{totalBottles.toLocaleString()}</strong> bottles</span>
          {totalSamplesNum > 0 && (
            <>
              <span style={{ margin: '0 6px', color: '#94a3b8' }}>|</span>
              <span style={{ color: '#7c3aed', fontWeight: 600, fontSize: 12 }}>
                🧪 {totalSamplesNum} Samples
              </span>
              <span style={{ margin: '0 6px', color: '#94a3b8' }}>→</span>
              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 12 }}>
                ✅ Net {netCommercialBottles.toLocaleString()} BTL
              </span>
              {orderAllocatedNum > 0 && (
                <>
                  <span style={{ margin: '0 4px', color: '#94a3b8' }}>:</span>
                  <span style={{ color: '#0369a1', fontWeight: 600, fontSize: 12 }}>
                    📦 SO {orderAllocatedNum.toLocaleString()}
                  </span>
                  {bufferStockNum > 0 && (
                    <>
                      <span style={{ margin: '0 4px', color: '#94a3b8' }}>+</span>
                      <span style={{ color: '#15803d', fontWeight: 600, fontSize: 12 }}>
                        🏭 Buffer {bufferStockNum.toLocaleString()}
                      </span>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="prc-bottom-right">
          <button
            type="button"
            className="prc-btn-slip prc-btn-save-rev"
            onClick={handleSaveToRevision}
            disabled={savingRevision}
          >
            {savingRevision ? 'Saving…' : '💾 Save Formula to Revision'}
          </button>
          <button
            type="button"
            className="prc-btn-slip prc-btn-rm"
            onClick={handlePrintAttachment1}
          >
            📄 Generate RM Slip (Att. 1)
          </button>
          <button
            type="button"
            className="prc-btn-slip prc-btn-pm"
            onClick={handlePrintAttachment4}
          >
            📦 Generate PM Slip (Att. 4)
          </button>
          {stockSummary.allInStock && (
            <button
              type="button"
              className="prc-btn-slip"
              onClick={handleOpenIssueConfirm}
              disabled={issuingToProduction}
              style={{
                background: issuingToProduction
                  ? 'linear-gradient(135deg, #9ca3af, #6b7280)'
                  : 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                boxShadow: issuingToProduction ? 'none' : '0 3px 12px rgba(22, 163, 74, 0.35)',
              }}
            >
              {issuingToProduction ? '⏳ Issuing...' : '🚀 Issue All to Production'}
            </button>
          )}
        </div>
      </div>

      {/* DIRECT PURCHASE ORDER MODAL */}
      {createPoModalOpen && (
        <PurchaseOrderModal
          isOpen={true}
          mode="create"
          storeId={selectedStoreId}
          storeName={stores.find((s) => String(s.id) === String(selectedStoreId))?.name || 'Selected Warehouse'}
          companyId={companyId}
          companies={companies}
          order={prefillPoOrder}
          onClose={() => {
            setCreatePoModalOpen(false)
            setPrefillPoOrder(null)
          }}
          onSaved={(savedPo) => {
            setCreatePoModalOpen(false)
            setPrefillPoOrder(null)
            setStockRefreshCount((c) => c + 1)
            setActionSuccess(
              `Purchase Order ${savedPo?.po_number || ''} created successfully! Live stock balance will update upon receipt.`
            )
            setTimeout(() => setActionSuccess(''), 7000)
          }}
        />
      )}

      {/* THEMED ISSUE TO PRODUCTION CONFIRMATION MODAL */}
      <IssueToProductionModal
        isOpen={confirmIssueModalOpen}
        onClose={() => {
          if (!issuingToProduction) {
            setConfirmIssueModalOpen(false)
            setIssueResults(null)
          }
        }}
        onConfirm={handleExecuteIssueToProduction}
        items={stockSummary.list.filter((item) => item.materialId && item.targetQty > 0)}
        storeName={stores.find((s) => String(s.id) === String(selectedStoreId))?.name || 'Selected Warehouse'}
        batchNo={batchNo}
        productName={productName}
        productCode={productCode}
        targetVolumeLtr={targetVolumeLtr}
        totalBottles={totalBottles}
        isIssuing={issuingToProduction}
        progress={issueProgress}
        results={issueResults}
      />

      {/* CATALOG MATERIALS DATALIST FOR EASY AUTO-BINDING */}
      <datalist id="catalog-raw-materials">
        {[...catalogMaterials, ...catalogPkgMaterials].map((cm) => (
          <option key={cm.id} value={cm.name}>
            {cm.code ? `${cm.code} — ` : ''}{cm.name} {cm.unitCode ? `(${cm.unitCode})` : ''}
          </option>
        ))}
      </datalist>

    </div>
  )
}
