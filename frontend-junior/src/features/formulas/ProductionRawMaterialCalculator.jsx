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
  const packagingLines = useMemo(() => {
    return [
      { name: `${packSizeMl}ml Dropper Glass/PET Bottles`, qty: totalBottles, unit: 'NOS' },
      { name: 'Dropper Assembly Caps (Cap + Teat + Pipette)', qty: totalBottles, unit: 'NOS' },
      { name: `Printed Unit Labels (${productName} ${packSizeMl}ml)`, qty: totalBottles, unit: 'NOS' },
      { name: `Outer Printed Unit Cartons (${packSizeMl}ml)`, qty: totalBottles, unit: 'NOS' },
      { name: '5-Ply Corrugated Master Shippers (Pack of 48)', qty: Math.ceil(totalBottles / 48), unit: 'BOX' },
      { name: 'Self-Adhesive BOPP Packaging Tape (Brown/Clear)', qty: Math.ceil(totalBottles / 500) || 1, unit: 'NOS' },
    ]
  }, [packSizeMl, productName, totalBottles])

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
  useEffect(() => {
    searchMaterials('', 'RAW_MATERIAL', 200)
      .then((rows) => setCatalogMaterials(rows || []))
      .catch(() => {})
  }, [])

  const resolveMaterialId = (item) => {
    if (item.materialId) return item.materialId
    if (item.material_id) return item.material_id
    const n = (item.name || '').toLowerCase().trim()
    const code = (item.materialCode || item.code || '').toLowerCase().trim()

    // 1. Direct match from catalog materials
    const match = catalogMaterials.find((cm) => {
      const cmn = (cm.name || '').toLowerCase().trim()
      const cmc = (cm.code || '').toLowerCase().trim()
      return (cmn && cmn === n) || (cmc && cmc === code) || (cmn && cmn.includes(n)) || (n && n.includes(cmn))
    })
    if (match) return match.id

    // 2. Fallback heuristic matching for known standard homeopathic ingredients
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
    return null
  }

  const resolveMaterialMeta = (item) => {
    const matId = resolveMaterialId(item)
    const n = (item.name || '').toLowerCase().trim()
    let code = item.materialCode || item.code || ''
    if (!code && matId) {
      const cm = catalogMaterials.find((c) => String(c.id) === String(matId))
      if (cm?.code) code = cm.code
    }
    if (!code) {
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
          material_kind: 'RAW',
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

  // Query live stock balance from store for each formula raw material
  useEffect(() => {
    if (!selectedStoreId) return
    let cancelled = false
    setStockLoading(true)

    const items = [
      ...compositions,
      ...preservatives,
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
  }, [selectedStoreId, companyId, compositions, preservatives, catalogMaterials, stockRefreshCount])

  // Comprehensive stock summary comparing required quantities against store balances
  const stockSummary = useMemo(() => {
    const list = []
    // 1. Active Compositions
    compositions.forEach((row) => {
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
    // 2. Preservatives
    preservatives.forEach((row) => {
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
    // 3. Alcohol Vehicle (use net after raw material deductions)
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
  }, [compositions, preservatives, scaleMultiplier, stockBalances, alcoholRequiredLtr, netAlcoholRequiredLtr, catalogMaterials])

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
          const match = catalogMaterials.find(
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
          const match = catalogMaterials.find(
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

  const handlePrintAttachment1 = () => {
    if (onOpenBmrSlip) {
      onOpenBmrSlip(buildLivePayload(), 'RM')
    }
  }

  const handlePrintAttachment4 = () => {
    if (onOpenBmrSlip) {
      onOpenBmrSlip(buildLivePayload(), 'PM')
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
      {/* TEMPLATE QUICK-SWITCH BANNER */}
      <div className="prc-template-banner">
        <div className="prc-tb-left">
          <span className="prc-tb-tag">⚡ {productName || 'FORMULA'}</span>
          <span className="prc-tb-text">
            <strong>{compositions.length}</strong> active materials · Scale <strong>{scaleMultiplier.toFixed(2)}×</strong>
          </span>
        </div>
        <div className="prc-tb-buttons">
          <button
            type="button"
            className="prc-btn-preset-saved"
            onClick={handleLoadSavedRevision}
            title="Reload materials directly from the saved revision in database"
          >
            🔄 Reset from Revision
          </button>
          <button
            type="button"
            className="prc-btn-preset-excel"
            onClick={handleApplyExcelTemplate}
            title="Load 10-liquid Excel Master template (3L / 9L)"
          >
            📋 Load Excel Preset
          </button>
        </div>
      </div>

      {/* 1. TOP HEADER & METADATA BAR (MATCHING THE EXCEL SPREADSHEET HEADER) */}
      <div className="prc-excel-header-card">
        <div className="prc-header-top">
          <div className="prc-logo-box">
            <span className="prc-logo-badge">CYMHP</span>
            <div className="prc-company-heading">
              <h2>CMHP PRIVATE LIMITED</h2>
              <p>PRODUCTION (ORAL LIQUID / DROPS DEPARTMENT)</p>
            </div>
          </div>

          <div className="prc-qa-badge-box">
            {revision ? (
              <span className={`prc-qa-badge prc-qa-${(revision.status || 'draft').toLowerCase()}`}>
                {revision.status === 'APPROVED' && '✅ QA APPROVED'}
                {revision.status === 'SUBMITTED' && '⏳ SUBMITTED FOR QA'}
                {(!revision.status || revision.status === 'DRAFT') && '📝 DRAFT'}
              </span>
            ) : (
              <span className="prc-qa-badge prc-qa-draft">📝 DRAFT</span>
            )}
            {revision?.status === 'APPROVED' && (
              <span className="prc-qa-verified-note">Verified for Production Batch</span>
            )}
          </div>
        </div>

        {actionSuccess && (
          <Alert type="success" style={{ margin: '10px 0 0' }}>
            {actionSuccess}
          </Alert>
        )}
        {revisionError && (
          <Alert type="error" style={{ margin: '10px 0 0' }}>
            {revisionError}
          </Alert>
        )}

        {/* EXCEL TITLE & METADATA GRID */}
        <div className="prc-meta-grid">
          <div className="prc-meta-cell prc-meta-product-title">
            <label>Product Name</label>
            <input
              className="prc-input prc-input-lg"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. PREGACURE DROP"
            />
          </div>

          <div className="prc-meta-cell">
            <label>Pack Size</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                className="prc-input"
                style={{ flex: 1, fontWeight: 700 }}
                value={packSizeMl}
                onChange={(e) => setPackSizeMl(e.target.value)}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>ML</span>
            </div>
          </div>

          <div className="prc-meta-cell">
            <label>Company Name</label>
            <input
              className="prc-input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="prc-meta-cell">
            <label>Product Code</label>
            <input
              className="prc-input"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
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

          <div className="prc-meta-cell">
            <label>Issue Date</label>
            <input
              type="date"
              className="prc-input"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>

          <div className="prc-meta-cell">
            <label>Batch No.</label>
            <input
              className="prc-input"
              style={{ fontWeight: 700, color: '#0369a1' }}
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
            />
          </div>

          <div className="prc-meta-cell prc-meta-highlight">
            <label>Batch Size (LTR)</label>
            <div className="prc-batch-size-val">{formatNum(targetVolumeLtr, 0)} LTR</div>
          </div>
        </div>
      </div>

      {/* 2. SMART BATCH SCALING CALCULATOR PANEL */}
      <div className="prc-calculator-control-card">
        <div className="prc-calc-card-header">
          <div className="prc-calc-title">
            <span className="prc-calc-icon">🧮</span>
            <div>
              <h3>Batch & Bottle Calculator</h3>
              <p>Scale raw materials, excipients and vehicle in real time.</p>
            </div>
          </div>

          {/* Quick Print Slips Buttons */}
          <div className="prc-actions-group">
            <button
              type="button"
              className="prc-btn-slip prc-btn-save-rev"
              onClick={handleSaveToRevision}
              disabled={savingRevision}
              title="Permanently save these quantities into Revision Bill of Materials"
            >
              {savingRevision ? 'Saving…' : '💾 Save to Master Revision'}
            </button>
            <button
              type="button"
              className="prc-btn-slip prc-btn-rm"
              onClick={handlePrintAttachment1}
              title="Print Attachment 1 - RM Requisition Slip"
            >
              📄 RM Slip (Att. 1)
            </button>
            <button
              type="button"
              className="prc-btn-slip prc-btn-pm"
              onClick={handlePrintAttachment4}
              title="Print Attachment 4 - PM Requirement Slip"
            >
              📦 PM Slip (Att. 4)
            </button>
          </div>
        </div>

        {/* INPUTS ROW */}
        <div className="prc-calc-inputs-row">
          <div className="prc-mode-selector">
            <label className="prc-field-title">Calculation Mode:</label>
            <div className="prc-toggle-group">
              <button
                type="button"
                className={`prc-toggle-btn ${calcMode === 'BOTTLES' ? 'active' : ''}`}
                onClick={() => setCalcMode('BOTTLES')}
              >
                🍾 By Number of Bottles
              </button>
              <button
                type="button"
                className={`prc-toggle-btn ${calcMode === 'VOLUME' ? 'active' : ''}`}
                onClick={() => setCalcMode('VOLUME')}
              >
                🧪 By Total Litres
              </button>
            </div>
          </div>

          {calcMode === 'BOTTLES' ? (
            <div className="prc-input-box">
              <label>Target Bottles / Packs</label>
              <div className="prc-input-with-tag">
                <input
                  type="number"
                  className="prc-large-input"
                  value={bottleCount}
                  onChange={(e) => setBottleCount(e.target.value)}
                  placeholder="e.g. 3024"
                />
                <span className="prc-input-tag">Bottles</span>
              </div>
              {/* Auto-calculated hint */}
              <div className="prc-auto-calc-hint">
                <span className="prc-auto-icon">⚡</span>
                <span>Auto-calculated: {formatNum(bottleCount, 0)} × {packSizeMl}ml = <strong>{formatNum(targetVolumeLtr, 2)} Litres</strong></span>
              </div>
            </div>
          ) : (
            <div className="prc-input-box">
              <label>Target Batch Output (L)</label>
              <div className="prc-input-with-tag">
                <input
                  type="number"
                  step="any"
                  className="prc-large-input"
                  value={targetVolumeLtr}
                  onChange={(e) => handleVolumeChange(e.target.value)}
                  placeholder="e.g. 90"
                />
                <span className="prc-input-tag">Litres</span>
              </div>
              <span className="prc-input-hint">
                = <strong>{formatNum(bottleCount, 0)}</strong> finished {packSizeMl}ml bottles
              </span>
            </div>
          )}

          <div className="prc-input-box">
            <label>Base Reference Batch (Excel Base)</label>
            <div className="prc-input-with-tag">
              <input
                type="number"
                className="prc-large-input"
                value={baseBatchLtr}
                onChange={(e) => setBaseBatchLtr(e.target.value)}
              />
              <span className="prc-input-tag">Litres</span>
            </div>
            <span className="prc-input-hint">Formula standard (30 LTR)</span>
          </div>

          <div className="prc-scale-stat-badge">
            <div className="prc-ssb-label">Scale Multiplier</div>
            <div className="prc-ssb-val">{scaleMultiplier.toFixed(2)}×</div>
            <div className="prc-ssb-sub">{baseBatchLtr}L ➔ {targetVolumeLtr}L</div>
          </div>
        </div>

        {/* 3. ALCOHOL & WATER VEHICLE BALANCE (C1V1 = ΣC2V2 NET ENA CALCULATION) */}
        <div className="prc-vehicle-panel">
          <div className="prc-vehicle-topbar">
            <div className="prc-vt-left">
              <span className="prc-vt-icon">⚗️</span>
              <span className="prc-vt-title">Alcohol & Vehicle Balance</span>
              <span className="prc-vt-sub">C₁V₁ = Σ(C₂V₂) Net ENA & Purified Water requirement</span>
            </div>
            <div className="prc-vt-right">
              <div className="prc-vt-mode-toggle">
                <button
                  type="button"
                  className={alcCalcMode === 'AUTO' ? 'active' : ''}
                  onClick={() => setAlcCalcMode('AUTO')}
                >
                  ⚡ Auto (Target %)
                </button>
                <button
                  type="button"
                  className={alcCalcMode === 'MANUAL' ? 'active' : ''}
                  onClick={() => {
                    setAlcCalcMode('MANUAL')
                    if (!manualGrossAlcohol) setManualGrossAlcohol(String(autoGrossAlcoholLtr))
                  }}
                >
                  ✍️ Manual Input
                </button>
              </div>

              {alcCalcMode === 'AUTO' ? (
                <div className="prc-vt-inputs-inline">
                  <div className="prc-vt-field">
                    <label>Target Alc %:</label>
                    <input
                      type="number"
                      step="any"
                      value={targetAlcoholPct}
                      onChange={(e) => setTargetAlcoholPct(e.target.value)}
                    />
                    <span>% v/v</span>
                  </div>
                  <div className="prc-vt-field">
                    <label>ENA Strength:</label>
                    <input
                      type="number"
                      step="any"
                      value={alcoholStrengthPct}
                      onChange={(e) => setAlcoholStrengthPct(e.target.value)}
                    />
                    <span>% v/v</span>
                  </div>
                </div>
              ) : (
                <div className="prc-vt-inputs-inline">
                  <div className="prc-vt-field">
                    <label>Manual Gross Alcohol:</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={manualGrossAlcohol}
                      onChange={(e) => setManualGrossAlcohol(e.target.value)}
                      placeholder="0.00"
                      style={{ width: 68 }}
                    />
                    <select
                      value={manualGrossAlcoholUnit}
                      onChange={(e) => setManualGrossAlcoholUnit(e.target.value)}
                    >
                      <option value="lit">Ltr</option>
                      <option value="ML">ML</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="prc-vt-btn-reset"
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

          <div className="prc-vehicle-cards-grid">
            {/* CARD 1: GROSS ALCOHOL */}
            <div className="prc-vcard prc-vcard-gross">
              <div className="prc-vcard-step">
                <span className="prc-vcard-tag">STEP 1 · GROSS</span>
                <span className="prc-vcard-title">Gross Required</span>
              </div>
              <div className="prc-vcard-body">
                <div className="prc-vcard-val">
                  {formatNum(grossAlcoholRequiredLtr, 3)} <span className="prc-vcard-unit">litres</span>
                </div>
                <span className="prc-vcard-pill">
                  {formatNum(grossAlcoholRequiredMl, 1)} ML
                </span>
              </div>
              <div className="prc-vcard-foot">
                {alcCalcMode === 'MANUAL'
                  ? '✍️ Specified via manual entry'
                  : `= ${formatNum(targetVolumeLtr, 2)}L × ${targetAlcoholPct}% ÷ ${alcoholStrengthPct}%`}
              </div>
            </div>

            {/* CARD 2: RAW MATERIAL ALCOHOL DEDUCTION */}
            <div className="prc-vcard prc-vcard-rm">
              <div className="prc-vcard-step">
                <span className="prc-vcard-tag">STEP 2 · RM DEDUCTION</span>
                <span className="prc-vcard-title" style={{ color: '#b45309' }}>− In Raw Materials</span>
              </div>
              <div className="prc-vcard-body">
                <div className="prc-vcard-val">
                  {totalRawMaterialAlcoholLtr > 0.000001 ? `−${formatNum(totalRawMaterialAlcoholLtr, 3)}` : '0.000'}{' '}
                  <span className="prc-vcard-unit">litres</span>
                </div>
                <span className="prc-vcard-pill">
                  {totalRawMaterialAlcoholLtr > 0.000001 ? `−${formatNum(totalRawMaterialAlcoholMl, 1)} ML` : '0.0 ML'}
                </span>
              </div>
              <div className="prc-vcard-foot" style={{ color: '#92400e' }}>
                {totalRawMaterialAlcoholLtr > 0.000001
                  ? `Contributed from ${rawMaterialAlcoholBreakdown.filter((r) => r.alcoholContributionLtr > 0).length} active ingredient(s)`
                  : '0.00 L (Set Alcohol % in table below to deduct)'}
              </div>
            </div>

            {/* CARD 3: NET ENA TO ADD */}
            <div className="prc-vcard prc-vcard-net">
              <div className="prc-vcard-step">
                <span className="prc-vcard-tag">STEP 3 · DISPENSE</span>
                <span className="prc-vcard-title">⚗️ Net ENA / RS to Add</span>
              </div>
              <div className="prc-vcard-body">
                <div className="prc-vcard-val">
                  {formatNum(netAlcoholRequiredLtr, 3)} <span className="prc-vcard-unit">litres</span>
                </div>
                <span className="prc-vcard-pill">
                  {formatNum(netAlcoholRequiredMl, 1)} ML
                </span>
              </div>
              <div className="prc-vcard-foot">
                (= {formatNum(grossAlcoholRequiredLtr, 3)}L Gross − {formatNum(totalRawMaterialAlcoholLtr, 3)}L in RMs)
              </div>
            </div>

            {/* CARD 4: WATER REQUIRED */}
            <div className="prc-vcard prc-vcard-water">
              <div className="prc-vcard-step">
                <span className="prc-vcard-tag">STEP 4 · VEHICLE</span>
                <span className="prc-vcard-title" style={{ color: '#047857' }}>💧 Water Required (Q.S.)</span>
              </div>
              <div className="prc-vcard-body">
                <div className="prc-vcard-val">
                  {formatNum(waterRequiredLtr, 3)} <span className="prc-vcard-unit">litres</span>
                </div>
                <span className="prc-vcard-pill">
                  {formatNum(waterRequiredMl, 1)} ML
                </span>
              </div>
              <div className="prc-vcard-foot" style={{ color: '#065f46' }}>
                = Batch ({formatNum(targetVolumeLtr, 2)}L) − RMs ({formatNum(totalLiquidRmVolumeLtr, 3)}L) − Net ENA ({formatNum(netAlcoholRequiredLtr, 3)}L)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. ACTIVE RAW MATERIALS COMPOSITION TABLE (MATCHING EXCEL SPREADSHEET) */}
      <div className="prc-table-card">
        <div className="prc-table-title-row">
          <div>
            <h4>🧪 Active Dilutions & Ingredients (Section 1)</h4>
            <p>
              {compositions.length} active raw material{compositions.length === 1 ? '' : 's'} for <strong>{productName}</strong>. Base {baseBatchLtr}L is multiplied by {scaleMultiplier.toFixed(2)}× for {targetVolumeLtr}L batch.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>🏢 Store:</span>
              <select
                className="prc-cell-select"
                style={{ width: 'auto', minWidth: 140, padding: '2px 6px', fontSize: 12, fontWeight: 600, background: '#fff' }}
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
              className="prc-btn-preset-excel"
              style={{ fontSize: 12, padding: '4px 10px', background: 'linear-gradient(135deg, #d97706, #b45309)' }}
              onClick={() => handleSetTincturesAlcohol(60)}
              title="Set all Mother Tinctures (Q) to standard 60% alcohol content"
            >
              🧪 Set Q Tinctures to 60% Alc
            </button>
            <button
              type="button"
              className="prc-btn-preset-excel"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={handleApplyExcelTemplate}
            >
              ⚡ Set All to 3 Lit / 9 Lit
            </button>
            <button type="button" className="prc-btn-add" onClick={addCompRow}>
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
                        <input
                          className="prc-cell-input"
                          list="catalog-raw-materials"
                          value={row.name}
                          onChange={(e) => updateComp(row.id, 'name', e.target.value)}
                          placeholder="Type or select material from catalog..."
                        />
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
                    <td style={{ textAlign: 'right', fontWeight: 600, color: isShort ? '#b91c1c' : '#15803d' }}>
                      {stockLoading ? (
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
                      {isShort ? (
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
                    <td style={{ textAlign: 'right', fontWeight: 600, color: isShort ? '#b91c1c' : '#15803d' }}>
                      {stockLoading ? (
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
                      {isShort ? (
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
                <th style={{ width: 160, textAlign: 'right' }}>Quantity Required</th>
                <th style={{ width: 80 }}>Unit</th>
                <th style={{ width: 140 }}>AR / Lot No.</th>
              </tr>
            </thead>
            <tbody>
              {packagingLines.map((pkg, idx) => (
                <tr key={`pkg-${idx}`}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{pkg.name}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                    {pkg.qty.toLocaleString()}
                  </td>
                  <td>{pkg.unit}</td>
                  <td style={{ color: '#94a3b8' }}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        {catalogMaterials.map((cm) => (
          <option key={cm.id} value={cm.name}>
            {cm.code ? `${cm.code} — ` : ''}{cm.name} {cm.unitCode ? `(${cm.unitCode})` : ''}
          </option>
        ))}
      </datalist>

    </div>
  )
}
