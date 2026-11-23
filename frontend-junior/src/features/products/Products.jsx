import { useState, useMemo, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import {
  addProduct,
  editProduct,
  deleteProduct,
  saveProductLastSelection,
  saveFormula,
  addFormulaRevision,
  saveRevisionMaterials,
  submitFormulaApproval,
  withdrawFormulaApproval,
} from '../../store/erpSlice'
import { previewDocumentNumber, commitDocumentNumber } from '../../utils/documentNumbers'
import {
  selectProducts,
  selectFormulas,
  selectFormulaApprovals,
  selectActiveCompanyId,
  selectActiveCompanyKey,
} from '../../utils/companySelectors'
import {
  SUPPORTED_UNITS,
  calculateBatchScaleFactor,
  calculateRevisionRequirements,
  formatPharmaNumber,
} from './formulaCalculation'
import BmrRequisitionDocument from '../../components/BmrRequisitionDocument'
import {
  exportFormulaPrint,
  exportFormulaExcel,
  exportFormulaCsv,
} from '../../utils/formulaExport'
import { listBatchPlans } from '../manufacturing/batchPlansService'
import './Products.css'

const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Injection',
  'Ointment',
  'Cream',
  'Gel',
  'Drops',
  'Inhaler',
  'Solution',
  'Powder',
  'Emulsion',
  'Mother Tincture',
]

const COMMON_RAW_MATERIALS = []

export default function Products() {
  const dispatch = useDispatch()
  const products = useSelector(selectProducts)
  const formulas = useSelector(selectFormulas)
  const formulaApprovals = useSelector(selectFormulaApprovals)
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const activeCompanyKey = useSelector(selectActiveCompanyKey)

  // QC Approval Flow State
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalRemarks, setApprovalRemarks] = useState('')
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showBmrDocModal, setShowBmrDocModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  // Navigation & View Mode
  const [activeView, setActiveView] = useState('list') // 'list' | 'formula'
  const [selectedProductId, setSelectedProductId] = useState(null)

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [dosageFilter, setDosageFilter] = useState('')

  // Notifications
  const [notification, setNotification] = useState({ type: '', message: '' })

  // Modals
  const [productModalMode, setProductModalMode] = useState(null) // 'add' | 'edit' | null
  const [productForm, setProductForm] = useState({
    name: '',
    code: '',
    dosage_form: 'Tablet',
    strength: '',
    pack_size: '',
    description: '',
  })
  const [modalError, setModalError] = useState('')
  const [deleteProductTarget, setDeleteProductTarget] = useState(null)

  // Formula Flow State
  const [formulaStep, setFormulaStep] = useState(1) // 1: Formula & Revision, 2: Raw Materials
  const [selectedFormulaId, setSelectedFormulaId] = useState(null)
  const [selectedRevisionId, setSelectedRevisionId] = useState(null)

  // Step 1: Add Formula / Add Revision forms
  const [showAddFormulaForm, setShowAddFormulaForm] = useState(false)
  const [newFormulaData, setNewFormulaData] = useState({
    name: '',
    base_quantity: '100',
    base_unit: 'g',
  })
  const [formulaFormError, setFormulaFormError] = useState('')

  const [showAddRevisionForm, setShowAddRevisionForm] = useState(false)
  const [newRevisionData, setNewRevisionData] = useState({
    name: '',
    description: '',
    copyCurrentMaterials: true,
  })
  const [revisionFormError, setRevisionFormError] = useState('')

  // Step 2: Add Raw Material Form
  const [materialForm, setMaterialForm] = useState({
    name: '',
    base_quantity: '',
    unit: 'g',
  })
  const [materialFormError, setMaterialFormError] = useState('')
  const [editingMaterialId, setEditingMaterialId] = useState(null)
  const [deleteMaterialTarget, setDeleteMaterialTarget] = useState(null)

  // Calculation Engine State
  const [requiredBatchQty, setRequiredBatchQty] = useState('1')
  const [requiredBatchUnit, setRequiredBatchUnit] = useState('kg')

  // Product Production & Batch History State
  const [batchHistoryProduct, setBatchHistoryProduct] = useState(null)
  const [batchHistoryList, setBatchHistoryList] = useState([])
  const [batchHistoryLoading, setBatchHistoryLoading] = useState(false)

  const handleOpenBatchHistory = async (prod) => {
    setBatchHistoryProduct(prod)
    setBatchHistoryLoading(true)
    try {
      const res = await listBatchPlans(activeCompanyId, { search: prod.code })
      const plans = res?.results || (Array.isArray(res) ? res : [])
      const productPlans = plans.filter(
        (p) =>
          String(p.product_id_snapshot) === String(prod.id) ||
          p.product_code_snapshot?.toLowerCase() === prod.code?.toLowerCase() ||
          p.product_name_snapshot?.toLowerCase() === prod.name?.toLowerCase()
      )
      setBatchHistoryList(productPlans)
    } catch (_) {
      setBatchHistoryList([])
    } finally {
      setBatchHistoryLoading(false)
    }
  }

  // Auto-clear notification after 4s
  useEffect(() => {
    if (notification.message) {
      const timer = setTimeout(() => setNotification({ type: '', message: '' }), 4000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  // Get active product
  const activeProduct = useMemo(() => {
    return products.find((p) => String(p.id) === String(selectedProductId)) || null
  }, [products, selectedProductId])

  // Get formulas for active product
  const productFormulas = useMemo(() => {
    if (!activeProduct) return []
    return formulas.filter((f) => String(f.product_id) === String(activeProduct.id))
  }, [formulas, activeProduct])

  // Get active formula
  const activeFormula = useMemo(() => {
    if (!productFormulas.length) return null
    if (selectedFormulaId) {
      const found = productFormulas.find((f) => String(f.id) === String(selectedFormulaId))
      if (found) return found
    }
    return productFormulas[0]
  }, [productFormulas, selectedFormulaId])

  // Get active revision
  const activeRevision = useMemo(() => {
    if (!activeFormula || !Array.isArray(activeFormula.revisions) || activeFormula.revisions.length === 0) {
      return null
    }
    if (selectedRevisionId) {
      const found = activeFormula.revisions.find((r) => String(r.id) === String(selectedRevisionId))
      if (found) return found
    }
    return activeFormula.revisions[0]
  }, [activeFormula, selectedRevisionId])

  // Sync batch unit when formula base unit changes if not touched
  useEffect(() => {
    if (activeFormula?.base_unit) {
      // Suggest matching default batch unit
      if (activeFormula.base_unit === 'g' || activeFormula.base_unit === 'mg') {
        setRequiredBatchUnit('kg')
      } else if (activeFormula.base_unit === 'kg') {
        setRequiredBatchUnit('kg')
      } else if (activeFormula.base_unit === 'ml' || activeFormula.base_unit === 'L') {
        setRequiredBatchUnit('L')
      }
    }
  }, [activeFormula?.base_unit])

  // When switching active product or entering formula view, auto-load saved formula & revision
  const handleOpenFormulaView = (product) => {
    setSelectedProductId(product.id)
    setActiveView('formula')
    setFormulaStep(1)
    setShowAddFormulaForm(false)
    setShowAddRevisionForm(false)
    setMaterialFormError('')

    const productFormulasList = formulas.filter((f) => String(f.product_id) === String(product.id))

    if (productFormulasList.length > 0) {
      // Restore last selected formula or fallback to first
      const targetFormula =
        productFormulasList.find((f) => String(f.id) === String(product.last_formula_id)) ||
        productFormulasList[0]

      setSelectedFormulaId(targetFormula.id)

      if (Array.isArray(targetFormula.revisions) && targetFormula.revisions.length > 0) {
        const targetRev =
          targetFormula.revisions.find((r) => String(r.id) === String(product.last_revision_id)) ||
          targetFormula.revisions[0]
        setSelectedRevisionId(targetRev.id)
      } else {
        setSelectedRevisionId(null)
      }
    } else {
      setSelectedFormulaId(null)
      setSelectedRevisionId(null)
    }
  }

  // Update product last selection on formula/revision change
  const handleSelectFormula = (fId) => {
    setSelectedFormulaId(fId)
    const targetF = productFormulas.find((f) => String(f.id) === String(fId))
    const firstRevId = targetF?.revisions?.[0]?.id || null
    setSelectedRevisionId(firstRevId)

    if (activeProduct) {
      dispatch(
        saveProductLastSelection({
          productId: activeProduct.id,
          formulaId: fId,
          revisionId: firstRevId,
        })
      )
    }
  }

  const handleSelectRevision = (rId) => {
    setSelectedRevisionId(rId)
    if (activeProduct && activeFormula) {
      dispatch(
        saveProductLastSelection({
          productId: activeProduct.id,
          formulaId: activeFormula.id,
          revisionId: rId,
        })
      )
    }
  }

  // Filtered Products List
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !searchQuery.trim() ||
        (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.strength && p.strength.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.dosage_form && p.dosage_form.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchDosage = !dosageFilter || p.dosage_form === dosageFilter
      return matchSearch && matchDosage
    })
  }, [products, searchQuery, dosageFilter])

  // Calculation Results
  const calculatedMaterials = useMemo(() => {
    if (!activeFormula || !activeRevision || !Array.isArray(activeRevision.materials)) {
      return []
    }
    return calculateRevisionRequirements({
      formulaBaseQty: activeFormula.base_quantity,
      formulaBaseUnit: activeFormula.base_unit,
      requiredBatchQty: requiredBatchQty,
      requiredBatchUnit: requiredBatchUnit,
      materials: activeRevision.materials,
    })
  }, [activeFormula, activeRevision, requiredBatchQty, requiredBatchUnit])

  // Multiplier / Scale Factor
  const currentScaleFactor = useMemo(() => {
    if (!activeFormula) return 1
    return calculateBatchScaleFactor(
      activeFormula.base_quantity,
      activeFormula.base_unit,
      requiredBatchQty,
      requiredBatchUnit
    )
  }, [activeFormula, requiredBatchQty, requiredBatchUnit])

  // Latest QC Approval record for active product
  const activeApproval = useMemo(() => {
    if (!activeProduct) return null
    const list = (formulaApprovals || []).filter(
      (a) => String(a.productId) === String(activeProduct.id)
    )
    if (!list.length) return null
    return list[list.length - 1]
  }, [formulaApprovals, activeProduct])

  const approvalStatus = useMemo(() => {
    if (activeApproval?.status) return activeApproval.status
    if (activeProduct?.formula_approval_status) return activeProduct.formula_approval_status
    return 'NOT_SUBMITTED'
  }, [activeApproval, activeProduct])

  const isPendingApproval = approvalStatus === 'PENDING'
  const isApproved = approvalStatus === 'APPROVED'
  const isDeclined = approvalStatus === 'DECLINED'
  const isNotSubmitted = approvalStatus === 'NOT_SUBMITTED'

  // Validation for "Get Approval from QC"
  const isCalculationValid = useMemo(() => {
    const qty = Number(requiredBatchQty)
    return (
      !isNaN(qty) &&
      qty > 0 &&
      Boolean(requiredBatchUnit) &&
      calculatedMaterials.length > 0
    )
  }, [requiredBatchQty, requiredBatchUnit, calculatedMaterials])

  const calculationInvalidReason = useMemo(() => {
    if (!requiredBatchQty || Number(requiredBatchQty) <= 0) {
      return 'Enter a valid Required Batch Quantity (> 0) to submit for QA approval.'
    }
    if (!requiredBatchUnit) {
      return 'Select a valid batch unit (kg, g, L, ml).'
    }
    if (calculatedMaterials.length === 0) {
      return 'At least one raw material must be added to the formula revision in Step 2.'
    }
    return ''
  }, [requiredBatchQty, requiredBatchUnit, calculatedMaterials])

  // Submit to QC Handler (Saves immutable snapshot)
  const handleConfirmSubmitToQc = () => {
    if (!activeProduct || !activeFormula || !activeRevision) return
    if (!isCalculationValid) return

    const frozenMaterials = calculatedMaterials.map((m, idx) => ({
      id: m.id,
      rmCode: m.rm_code || m.rmCode || `RM-${String(idx + 1).padStart(3, '0')}`,
      name: m.name,
      labelClaim: m.label_claim || m.labelClaim || `${m.baseQuantity} ${m.baseUnit}`,
      baseQuantity: Number(m.baseQuantity) || 0,
      baseUnit: m.baseUnit || 'g',
      scaledQuantity: Number(m.requiredQuantity) || 0,
      scaledUnit: m.bestFit?.unit || m.baseUnit || 'kg',
      displayQty: m.bestFit?.formatted || `${formatPharmaNumber(m.requiredQuantity, 3)} ${m.baseUnit}`,
      percentage: m.percentage !== null ? Number(m.percentage) : 0,
      arNo: m.arNo || '—',
      category: m.category || (m.isExcipient ? 'Excipient' : 'Active API'),
    }))

    const payload = {
      productId: activeProduct.id,
      productName: activeProduct.name,
      productCode: activeProduct.code,
      dosageForm: activeProduct.dosage_form,
      company: activeProduct.company || activeCompanyId,
      companyId: activeCompanyKey,
      formulaId: activeFormula.id,
      formulaName: activeFormula.name,
      revisionId: activeRevision.id,
      revisionName: activeRevision.name,
      formulaBaseQuantity: activeFormula.base_quantity,
      formulaBaseUnit: activeFormula.base_unit,
      batchQuantity: Number(requiredBatchQty),
      batchUnit: requiredBatchUnit,
      scaleFactor: currentScaleFactor,
      materials: frozenMaterials,
      remarks: approvalRemarks.trim(),
      submittedBy: 'Fenil Rami',
      submittedByRole: 'Production Chemist',
      snapshot: {
        product: { ...activeProduct },
        formula: { ...activeFormula },
        revision: { ...activeRevision },
        batchQuantity: Number(requiredBatchQty),
        batchUnit: requiredBatchUnit,
        scaleFactor: currentScaleFactor,
        calculatedMaterials: frozenMaterials,
      },
    }

    dispatch(submitFormulaApproval(payload))
    setShowApprovalModal(false)
    setApprovalRemarks('')
    setNotification({
      type: 'success',
      message: `Formulation for ${activeProduct.name} successfully submitted to QA for analytical approval!`,
    })
  }

  // Withdraw Request Handler
  const handleConfirmWithdrawRequest = () => {
    if (!activeApproval) return
    dispatch(
      withdrawFormulaApproval({
        id: activeApproval.id,
        reason: withdrawReason.trim() || 'Withdrawn by production chemist for formula adjustments.',
        withdrawnBy: 'Fenil Rami',
      })
    )
    setShowWithdrawModal(false)
    setWithdrawReason('')
    setNotification({
      type: 'info',
      message: 'QA approval request has been retracted back to draft.',
    })
  }

  /* =========================================================
     PRODUCT ACTIONS (ADD, EDIT, DELETE)
     ========================================================= */

  const handleOpenAddProduct = () => {
    setModalError('')
    const generatedCode = previewDocumentNumber('PRODUCT', activeCompanyId)
    setProductForm({
      name: '',
      code: generatedCode,
      dosage_form: 'Tablet',
      strength: '',
      pack_size: '',
      description: '',
    })
    setProductModalMode('add')
  }

  const handleOpenEditProduct = (product) => {
    setModalError('')
    setProductForm({
      name: product.name || '',
      code: product.code || '',
      dosage_form: product.dosage_form || 'Tablet',
      strength: product.strength || '',
      pack_size: product.pack_size || '',
      description: product.description || '',
    })
    setProductModalMode('edit')
  }

  const handleSaveProduct = (e) => {
    e.preventDefault()
    setModalError('')

    if (!productForm.name.trim()) {
      setModalError('Product Name is required.')
      return
    }
    if (!productForm.strength.trim()) {
      setModalError('Strength (e.g. 500 mg) is required.')
      return
    }
    if (!productForm.pack_size.trim()) {
      setModalError('Pack Size (e.g. 10x10 Tablets) is required.')
      return
    }

    if (productModalMode === 'add') {
      const finalCode = commitDocumentNumber('PRODUCT', activeCompanyId)
      dispatch(
        addProduct({
          name: productForm.name.trim(),
          code: finalCode,
          dosage_form: productForm.dosage_form,
          strength: productForm.strength.trim(),
          pack_size: productForm.pack_size.trim(),
          description: productForm.description.trim(),
          company: activeCompanyId,
          companyId: activeCompanyKey,
        })
      )
      setNotification({
        type: 'success',
        message: `Product "${productForm.name}" (${finalCode}) created successfully.`,
      })
    } else if (productModalMode === 'edit') {
      dispatch(
        editProduct({
          id: activeProduct?.id || selectedProductId,
          payload: {
            name: productForm.name.trim(),
            dosage_form: productForm.dosage_form,
            strength: productForm.strength.trim(),
            pack_size: productForm.pack_size.trim(),
            description: productForm.description.trim(),
          },
        })
      )
      setNotification({
        type: 'success',
        message: `Product details updated successfully.`,
      })
    }

    setProductModalMode(null)
  }

  const handleConfirmDeleteProduct = () => {
    if (!deleteProductTarget) return
    dispatch(deleteProduct({ id: deleteProductTarget.id }))
    setNotification({
      type: 'success',
      message: `Product "${deleteProductTarget.name}" deleted.`,
    })
    if (selectedProductId === deleteProductTarget.id) {
      setActiveView('list')
      setSelectedProductId(null)
    }
    setDeleteProductTarget(null)
  }

  /* =========================================================
     FORMULA ACTIONS (STEP 1)
     ========================================================= */

  const handleSaveNewFormula = (e) => {
    e.preventDefault()
    setFormulaFormError('')

    if (!newFormulaData.name.trim()) {
      setFormulaFormError('Formula Name is required.')
      return
    }
    const bQty = Number(newFormulaData.base_quantity)
    if (!bQty || bQty <= 0) {
      setFormulaFormError('Base Quantity must be a number greater than 0.')
      return
    }

    const newFId = Date.now()
    const defaultRevId = 'rev-00'

    dispatch(
      saveFormula({
        id: newFId,
        product_id: activeProduct.id,
        name: newFormulaData.name.trim(),
        base_quantity: bQty,
        base_unit: newFormulaData.base_unit,
        company: activeCompanyId,
        companyId: activeCompanyKey,
        revisions: [
          {
            id: defaultRevId,
            name: 'Rev 00',
            description: 'Initial approved production master formulation',
            created_at: new Date().toISOString(),
            materials: [],
          },
        ],
      })
    )

    dispatch(
      saveProductLastSelection({
        productId: activeProduct.id,
        formulaId: newFId,
        revisionId: defaultRevId,
      })
    )

    setSelectedFormulaId(newFId)
    setSelectedRevisionId(defaultRevId)
    setShowAddFormulaForm(false)
    setNewFormulaData({ name: '', base_quantity: '100', base_unit: 'g' })
    setNotification({
      type: 'success',
      message: `Formula "${newFormulaData.name}" created with Rev 00.`,
    })
  }

  const handleSaveNewRevision = (e) => {
    e.preventDefault()
    setRevisionFormError('')

    if (!activeFormula) {
      setRevisionFormError('Please select or create a formula first.')
      return
    }

    const currentRevs = activeFormula.revisions || []
    const nextRevNum = currentRevs.length
    const revName = newRevisionData.name.trim() || `Rev ${String(nextRevNum).padStart(2, '0')}`

    // Duplicate revision check
    if (currentRevs.some((r) => r.name.toLowerCase() === revName.toLowerCase())) {
      setRevisionFormError(`Revision "${revName}" already exists for this formula.`)
      return
    }

    const newRevId = `rev-${Date.now()}`
    const copiedMaterials =
      newRevisionData.copyCurrentMaterials && activeRevision?.materials
        ? activeRevision.materials.map((m) => ({ ...m, id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}` }))
        : []

    dispatch(
      addFormulaRevision({
        formulaId: activeFormula.id,
        revision: {
          id: newRevId,
          name: revName,
          description: newRevisionData.description.trim() || 'New revision',
          created_at: new Date().toISOString(),
          materials: copiedMaterials,
        },
      })
    )

    dispatch(
      saveProductLastSelection({
        productId: activeProduct.id,
        formulaId: activeFormula.id,
        revisionId: newRevId,
      })
    )

    setSelectedRevisionId(newRevId)
    setShowAddRevisionForm(false)
    setNewRevisionData({ name: '', description: '', copyCurrentMaterials: true })
    setNotification({
      type: 'success',
      message: `Revision "${revName}" created successfully.`,
    })
  }

  /* =========================================================
     RAW MATERIAL ACTIONS (STEP 2)
     ========================================================= */

  const handleAddMaterial = (e) => {
    e.preventDefault()
    setMaterialFormError('')

    if (!activeFormula || !activeRevision) {
      setMaterialFormError('Please ensure a formula and revision are selected.')
      return
    }

    const matName = materialForm.name.trim()
    if (!matName) {
      setMaterialFormError('Raw Material Name is required.')
      return
    }

    const baseQty = Number(materialForm.base_quantity)
    if (!baseQty || baseQty <= 0) {
      setMaterialFormError('Base Quantity must be greater than 0.')
      return
    }

    const currentMaterials = activeRevision.materials || []

    if (editingMaterialId) {
      // Editing existing material
      const duplicate = currentMaterials.find(
        (m) => m.id !== editingMaterialId && m.name.toLowerCase() === matName.toLowerCase()
      )
      if (duplicate) {
        setMaterialFormError(`Material "${matName}" already exists in this revision.`)
        return
      }

      const updated = currentMaterials.map((m) => {
        if (m.id === editingMaterialId) {
          return {
            ...m,
            name: matName,
            base_quantity: baseQty,
            unit: materialForm.unit,
          }
        }
        return m
      })

      dispatch(
        saveRevisionMaterials({
          formulaId: activeFormula.id,
          revisionId: activeRevision.id,
          materials: updated,
        })
      )

      setEditingMaterialId(null)
      setMaterialForm({ name: '', base_quantity: '', unit: 'g' })
      setNotification({ type: 'success', message: `Material updated.` })
      return
    }

    // Adding new material: Duplicate check!
    const isDuplicate = currentMaterials.some(
      (m) => m.name.toLowerCase() === matName.toLowerCase()
    )
    if (isDuplicate) {
      setMaterialFormError(`Material "${matName}" is already present in this revision.`)
      return
    }

    const newMaterial = {
      id: `mat-${Date.now()}`,
      name: matName,
      base_quantity: baseQty,
      unit: materialForm.unit,
    }

    const nextMaterials = [...currentMaterials, newMaterial]

    dispatch(
      saveRevisionMaterials({
        formulaId: activeFormula.id,
        revisionId: activeRevision.id,
        materials: nextMaterials,
      })
    )

    setMaterialForm({ name: '', base_quantity: '', unit: materialForm.unit })
    setNotification({
      type: 'success',
      message: `Added "${matName}" (${baseQty} ${materialForm.unit}) to ${activeRevision.name}.`,
    })
  }

  const handleStartEditMaterial = (material) => {
    setEditingMaterialId(material.id)
    setMaterialForm({
      name: material.name,
      base_quantity: String(material.base_quantity),
      unit: material.unit,
    })
    setMaterialFormError('')
  }

  const handleCancelEditMaterial = () => {
    setEditingMaterialId(null)
    setMaterialForm({ name: '', base_quantity: '', unit: 'g' })
    setMaterialFormError('')
  }

  const handleConfirmDeleteMaterial = () => {
    if (!deleteMaterialTarget || !activeFormula || !activeRevision) return
    const currentMaterials = activeRevision.materials || []
    const updated = currentMaterials.filter((m) => m.id !== deleteMaterialTarget.id)

    dispatch(
      saveRevisionMaterials({
        formulaId: activeFormula.id,
        revisionId: activeRevision.id,
        materials: updated,
      })
    )

    setNotification({
      type: 'success',
      message: `Removed "${deleteMaterialTarget.name}".`,
    })
    setDeleteMaterialTarget(null)
  }

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="products-page">
      {/* Notifications */}
      {notification.message && (
        <Alert type={notification.type}>{notification.message}</Alert>
      )}

      {/* Top Photo Banner (Consistent with all ERP pages) */}
      <div className="products-header top-banner">
        <div>
          <span className="page-hero-pill">PHARMACEUTICAL FORMULATION</span>
          <h1>Products &amp; Formulations</h1>
          <p>
            Pharma-grade product master, master formula records (MFR), revisions, and live batch scaling.
          </p>
        </div>
      </div>

      {/* =========================================================
          VIEW 1: PRODUCT LIST
          ========================================================= */}
      {activeView === 'list' && (
        <>
          {/* Top Stats Overview */}
          <div className="products-stats-row">
            <div className="product-stat-badge">
              <span className="num">{products.length}</span>
              <span className="label">Total Products</span>
            </div>
            <div className="product-stat-badge">
              <span className="num">{formulas.length}</span>
              <span className="label">Master Formulas</span>
            </div>
          </div>

          {/* Toolbar */}
          <div className="products-toolbar">
            <div className="products-search-filters">
              <div className="products-search-box">
                <span className="products-search-icon">🔍</span>
                <input
                  type="text"
                  className="products-search-input"
                  placeholder="Search product name, code, strength..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="products-filter-select"
                value={dosageFilter}
                onChange={(e) => setDosageFilter(e.target.value)}
              >
                <option value="">All Dosage Forms</option>
                {DOSAGE_FORMS.map((df) => (
                  <option key={df} value={df}>
                    {df}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handleOpenAddProduct}>
              + Add Product
            </Button>
          </div>

          {/* Product List Table */}
          <div className="products-card">
            <div className="products-table-wrapper">
              <table className="products-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Code</th>
                    <th>Dosage Form</th>
                    <th>Strength</th>
                    <th>Pack Size</th>
                    <th>Description</th>
                    <th>Formula Records</th>
                    <th>QA Approval</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan="9">
                        <div className="products-empty-state">
                          <span className="products-empty-icon">📦</span>
                          <h3>No pharmaceutical products found</h3>
                          <p>
                            {searchQuery || dosageFilter
                              ? 'No products match your search and filter criteria.'
                              : 'Get started by creating your first pharmaceutical product.'}
                          </p>
                          <Button onClick={handleOpenAddProduct}>
                            + Add Product
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((prod) => {
                      const prodFormulas = formulas.filter(
                        (f) => String(f.product_id) === String(prod.id)
                      )
                      const prodApproval = (formulaApprovals || []).find(
                        (a) => String(a.productId) === String(prod.id)
                      )
                      const pStatus = prodApproval?.status || prod.formula_approval_status || 'NOT_SUBMITTED'
                      const dosageClass = `dosage-${prod.dosage_form?.toLowerCase() || 'default'}`

                      return (
                        <tr key={prod.id}>
                          <td style={{ fontWeight: 600, color: '#123f61' }}>
                            {prod.name}
                          </td>
                          <td>
                            <span className="prd-code-tag">{prod.code}</span>
                          </td>
                          <td>
                            <span className={`dosage-badge ${dosageClass}`}>
                              {prod.dosage_form}
                            </span>
                          </td>
                          <td>
                            <strong>{prod.strength}</strong>
                          </td>
                          <td>{prod.pack_size}</td>
                          <td style={{ color: '#64748b', maxWidth: '240px' }}>
                            {prod.description || '—'}
                          </td>
                          <td>
                            {prodFormulas.length > 0 ? (
                              <span style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>
                                🧪 {prodFormulas.length} Formula{prodFormulas.length > 1 ? 's' : ''} (
                                {prodFormulas[0].revisions?.[0]?.name || 'Rev 00'})
                              </span>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                No Formula Defined
                              </span>
                            )}
                          </td>
                          <td>
                            {pStatus === 'APPROVED' ? (
                              <span className="approval-pill pill-approved" title={`Approved by QA (${prodApproval?.decidedBy || 'QA/QC'})`}>
                                ✓ Approved
                              </span>
                            ) : pStatus === 'PENDING' ? (
                              <span className="approval-pill pill-pending" title={`Pending QA review (Submitted by ${prodApproval?.submittedBy || 'Production'})`}>
                                ⏳ Pending QA
                              </span>
                            ) : pStatus === 'DECLINED' ? (
                              <span className="approval-pill pill-declined" title={`Declined by QA: ${prodApproval?.declineReason || 'Non-compliant'}`}>
                                ✕ Declined
                              </span>
                            ) : (
                              <span className="approval-pill pill-neutral" title="Formula calculation has not been submitted to QA">
                                Not Submitted
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="prd-actions-cell">
                              <button
                                type="button"
                                className="btn-action-edit"
                                onClick={() => {
                                  setSelectedProductId(prod.id)
                                  handleOpenEditProduct(prod)
                                }}
                                title="Edit Product Details"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-action-delete"
                                onClick={() => setDeleteProductTarget(prod)}
                                title="Delete Product"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                className="btn-action-edit"
                                style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}
                                onClick={() => handleOpenBatchHistory(prod)}
                                title="View Production Batch History"
                              >
                                <span>📋</span> Batches
                              </button>
                              <button
                                type="button"
                                className="btn-action-formula"
                                onClick={() => handleOpenFormulaView(prod)}
                                title="Manage Master Formula & Batch Calculations"
                              >
                                <span>🧪</span> Formula
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
          VIEW 2: FORMULA FLOW & LIVE BATCH CALCULATION
          ========================================================= */}
      {activeView === 'formula' && !activeProduct && (
        <div className="products-card">
          <div className="products-empty-state">
            <span className="products-empty-icon">📦</span>
            <h3>No Product Selected</h3>
            <p>Please select a product from the product list to view or configure its Master Formulas.</p>
            <Button onClick={() => setActiveView('list')}>← Back to Products List</Button>
          </div>
        </div>
      )}

      {activeView === 'formula' && activeProduct && (
        <div className="formula-flow-panel">
          {/* Active Product Banner */}
          <div className="formula-banner-card">
            <div className="formula-banner-info">
              <div className="formula-banner-title">
                <h2>{activeProduct.name}</h2>
                <span className="prd-code-tag">{activeProduct.code}</span>
                <span
                  className={`dosage-badge dosage-${activeProduct.dosage_form?.toLowerCase() || 'default'}`}
                >
                  {activeProduct.dosage_form}
                </span>
              </div>
              <div className="formula-banner-meta">
                <span>
                  Strength: <strong>{activeProduct.strength}</strong>
                </span>
                <span>
                  Pack Size: <strong>{activeProduct.pack_size}</strong>
                </span>
                {activeProduct.description && (
                  <span>
                    Indication: <em>{activeProduct.description}</em>
                  </span>
                )}
              </div>
            </div>

            <div className="formula-banner-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveView('list')
                  setSelectedProductId(null)
                }}
              >
                ← Back to Products List
              </Button>
            </div>
          </div>

          {/* Clear Step Indicator */}
          <div className="step-indicator-bar">
            <button
              type="button"
              className={`step-tab-btn ${formulaStep === 1 ? 'active' : ''} ${
                activeFormula ? 'completed' : ''
              }`}
              onClick={() => setFormulaStep(1)}
            >
              <span className="step-number-circle">1</span>
              <span>Step 1: Formula & Revision</span>
            </button>
            <button
              type="button"
              className={`step-tab-btn ${formulaStep === 2 ? 'active' : ''} ${
                activeRevision && (activeRevision.materials || []).length > 0 ? 'completed' : ''
              }`}
              onClick={() => {
                if (activeFormula) {
                  setFormulaStep(2)
                } else {
                  setNotification({
                    type: 'error',
                    message: 'Please select or add a formula first.',
                  })
                }
              }}
            >
              <span className="step-number-circle">2</span>
              <span>Step 2: Raw Materials & Formulation</span>
            </button>
            <button
              type="button"
              className={`step-tab-btn ${formulaStep === 3 ? 'active' : ''}`}
              onClick={() => {
                if (activeFormula && activeRevision) {
                  setFormulaStep(3)
                } else {
                  setNotification({
                    type: 'error',
                    message: 'Please select a formula and revision first.',
                  })
                }
              }}
            >
              <span className="step-number-circle">3</span>
              <span>Step 3: Batch Calculation</span>
            </button>
          </div>

          {/* STEP 1: FORMULA AND REVISION */}
          {formulaStep === 1 && (
            <div className="formula-step-card">
              <div className="formula-step-card-header">
                <h3>Step 1: Formula & Revision Selection</h3>
                <p>
                  Select an approved Master Formula and Revision, or create a new formulation profile for this drug product.
                </p>
              </div>

              <div className="formula-selector-group">
                {/* Select Formula Row */}
                <div className="formula-field-row">
                  <label>Select Master Formula</label>
                  <div className="formula-dropdown-action-row">
                    <select
                      className="formula-select"
                      value={activeFormula?.id || ''}
                      onChange={(e) => handleSelectFormula(Number(e.target.value) || e.target.value)}
                      disabled={productFormulas.length === 0}
                    >
                      {productFormulas.length === 0 ? (
                        <option value="">No formulas defined yet</option>
                      ) : (
                        productFormulas.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} (Base: {f.base_quantity} {f.base_unit})
                          </option>
                        ))
                      )}
                    </select>

                    <Button
                      variant="secondary"
                      onClick={() => setShowAddFormulaForm(!showAddFormulaForm)}
                    >
                      {showAddFormulaForm ? 'Cancel' : '+ Add New Formula'}
                    </Button>
                  </div>

                  {/* Add New Formula Inline Form */}
                  {showAddFormulaForm && (
                    <form className="inline-form-box" onSubmit={handleSaveNewFormula}>
                      <h4>Create New Master Formula</h4>
                      {formulaFormError && <Alert type="error">{formulaFormError}</Alert>}
                      <div className="form-grid-row">
                        <div>
                          <label className="field-label">Formula Name</label>
                          <input
                            type="text"
                            className="field-input"
                            placeholder="e.g. Master Wet Granulation Formula"
                            value={newFormulaData.name}
                            onChange={(e) =>
                              setNewFormulaData({ ...newFormulaData, name: e.target.value })
                            }
                            required
                          />
                        </div>

                        <div>
                          <label className="field-label">Base Quantity & Unit</label>
                          <div className="form-field-unit-group">
                            <input
                              type="number"
                              step="any"
                              min="0.0001"
                              className="field-input"
                              placeholder="e.g. 100"
                              value={newFormulaData.base_quantity}
                              onChange={(e) =>
                                setNewFormulaData({
                                  ...newFormulaData,
                                  base_quantity: e.target.value,
                                })
                              }
                              required
                            />
                            <select
                              value={newFormulaData.base_unit}
                              onChange={(e) =>
                                setNewFormulaData({
                                  ...newFormulaData,
                                  base_unit: e.target.value,
                                })
                              }
                            >
                              {SUPPORTED_UNITS.map((u) => (
                                <option key={u.value} value={u.value}>
                                  {u.value}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="inline-form-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setShowAddFormulaForm(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit">Save Formula</Button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Choose Revision Row */}
                {activeFormula && (
                  <div className="formula-field-row">
                    <label>Choose Revision</label>
                    <div className="formula-dropdown-action-row">
                      <select
                        className="formula-select"
                        value={activeRevision?.id || ''}
                        onChange={(e) => handleSelectRevision(e.target.value)}
                      >
                        {activeFormula.revisions?.map((rev) => (
                          <option key={rev.id} value={rev.id}>
                            {rev.name}
                            {rev.description ? ` — ${rev.description}` : ''} ({rev.materials?.length || 0} materials)
                          </option>
                        ))}
                      </select>

                      <Button
                        variant="secondary"
                        onClick={() => setShowAddRevisionForm(!showAddRevisionForm)}
                      >
                        {showAddRevisionForm ? 'Cancel' : '+ Add New Revision'}
                      </Button>
                    </div>

                    {/* Add New Revision Inline Form */}
                    {showAddRevisionForm && (
                      <form className="inline-form-box" onSubmit={handleSaveNewRevision}>
                        <h4>Create New Revision for "{activeFormula.name}"</h4>
                        {revisionFormError && <Alert type="error">{revisionFormError}</Alert>}
                        <div className="form-grid-row">
                          <div>
                            <label className="field-label">Revision Code / Name</label>
                            <input
                              type="text"
                              className="field-input"
                              placeholder={`e.g. Rev ${String(
                                activeFormula.revisions?.length || 0
                              ).padStart(2, '0')}`}
                              value={newRevisionData.name}
                              onChange={(e) =>
                                setNewRevisionData({ ...newRevisionData, name: e.target.value })
                              }
                            />
                          </div>

                          <div>
                            <label className="field-label">Revision Description / Purpose</label>
                            <input
                              type="text"
                              className="field-input"
                              placeholder="e.g. Formulation optimized for disintegration"
                              value={newRevisionData.description}
                              onChange={(e) =>
                                setNewRevisionData({
                                  ...newRevisionData,
                                  description: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>

                        {activeRevision?.materials?.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="checkbox"
                              id="copyMatCheck"
                              checked={newRevisionData.copyCurrentMaterials}
                              onChange={(e) =>
                                setNewRevisionData({
                                  ...newRevisionData,
                                  copyCurrentMaterials: e.target.checked,
                                })
                              }
                            />
                            <label htmlFor="copyMatCheck" style={{ fontSize: '13px', cursor: 'pointer' }}>
                              Copy {activeRevision.materials.length} raw materials from{' '}
                              <strong>{activeRevision.name}</strong> into this new revision
                            </label>
                          </div>
                        )}

                        <div className="inline-form-actions">
                          <Button
                            variant="secondary"
                            onClick={() => setShowAddRevisionForm(false)}
                          >
                            Cancel
                          </Button>
                          <Button type="submit">Create Revision</Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* Step 1 Footer Action */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                <Button
                  onClick={() => setFormulaStep(2)}
                  disabled={!activeFormula || !activeRevision}
                >
                  Next: Raw Materials →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: RAW MATERIALS */}
          {formulaStep === 2 && (!activeFormula || !activeRevision) && (
            <div className="formula-step-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>🧪</div>
              <h3 style={{ fontSize: '18px', color: '#123f61', marginBottom: '8px' }}>
                No Master Formula or Revision Selected
              </h3>
              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '480px', margin: '0 auto 20px auto' }}>
                Please select or create an approved Master Formula and Revision in Step 1 before specifying raw materials.
              </p>
              <div>
                <Button onClick={() => setFormulaStep(1)}>
                  ← Back to Step 1: Formula &amp; Revision
                </Button>
              </div>
            </div>
          )}

          {formulaStep === 2 && activeFormula && activeRevision && (
            <div className="formula-step-card">
              <div className="formula-step-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3>Step 2: Raw Materials Specification</h3>
                  <p>
                    Formula: <strong>{activeFormula.name}</strong> • Active Revision:{' '}
                    <strong>{activeRevision.name}</strong> (Base: {activeFormula.base_quantity}{' '}
                    {activeFormula.base_unit})
                  </p>
                </div>
                <Button variant="secondary" onClick={() => setFormulaStep(1)}>
                  ← Back to Step 1
                </Button>
              </div>

              {/* Add / Edit Raw Material Toolbar */}
              <form onSubmit={handleAddMaterial}>
                <div className="materials-entry-toolbar">
                  <div className="material-input-col">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      Raw Material Name {editingMaterialId && '(Editing)'}
                    </label>
                    <input
                      type="text"
                      className="field-input"
                      list="common-materials-list"
                      placeholder="Enter raw material name (API, binder, excipient...)"
                      value={materialForm.name}
                      onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })}
                    />
                    <datalist id="common-materials-list">
                      {COMMON_RAW_MATERIALS.map((mat) => (
                        <option key={mat} value={mat} />
                      ))}
                    </datalist>
                  </div>

                  <div className="material-qty-col">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      Base Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.00001"
                      className="field-input"
                      placeholder="e.g. 50"
                      value={materialForm.base_quantity}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, base_quantity: e.target.value })
                      }
                    />
                  </div>

                  <div className="material-unit-col">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      Unit
                    </label>
                    <select
                      className="field-input"
                      value={materialForm.unit}
                      onChange={(e) => setMaterialForm({ ...materialForm, unit: e.target.value })}
                    >
                      {SUPPORTED_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="material-btn-col">
                    {editingMaterialId ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button type="submit">Update</Button>
                        <Button variant="secondary" onClick={handleCancelEditMaterial}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button type="submit">+ Add New</Button>
                    )}
                  </div>
                </div>
              </form>

              {materialFormError && <Alert type="error">{materialFormError}</Alert>}

              {/* Raw Materials Table */}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <table className="materials-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Raw Material Name</th>
                      <th>Base Quantity</th>
                      <th>Unit</th>
                      <th>% of Formula Base</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!activeRevision.materials || activeRevision.materials.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                          <div>No raw materials added to this revision yet.</div>
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            Use the form above to add API and excipients.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      activeRevision.materials.map((mat, idx) => {
                        const pct =
                          activeFormula.base_quantity > 0
                            ? (Number(mat.base_quantity) / Number(activeFormula.base_quantity)) * 100
                            : 0

                        return (
                          <tr key={mat.id}>
                            <td style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                            <td style={{ fontWeight: 600, color: '#123f61' }}>{mat.name}</td>
                            <td>
                              <strong>{formatPharmaNumber(mat.base_quantity, 3)}</strong>
                            </td>
                            <td>
                              <span className="prd-code-tag">{mat.unit}</span>
                            </td>
                            <td>
                              {pct > 0 ? (
                                <span className="calc-share-badge">{pct.toFixed(2)}%</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn-action-edit"
                                  onClick={() => handleStartEditMaterial(mat)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn-action-delete"
                                  onClick={() => setDeleteMaterialTarget(mat)}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Step 2 Footer Navigation */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '16px',
                  borderTop: '1px solid #f1f5f9',
                  marginTop: '16px',
                }}
              >
                <Button variant="secondary" onClick={() => setFormulaStep(1)}>
                  ← Back to Step 1
                </Button>
                <Button onClick={() => setFormulaStep(3)}>
                  Next: Calculation →
                </Button>
              </div>
            </div>
          )}

          {/* =========================================================
              STEP 3: BATCH CALCULATION
              ========================================================= */}
          {formulaStep === 3 && (!activeFormula || !activeRevision) && (
            <div className="formula-step-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
              <h3 style={{ fontSize: '18px', color: '#123f61', marginBottom: '8px' }}>
                No Formula or Revision Selected
              </h3>
              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '480px', margin: '0 auto 20px auto' }}>
                Please select or create an approved Master Formula and Revision in Step 1 before calculating batch requirements.
              </p>
              <div>
                <Button onClick={() => setFormulaStep(1)}>
                  ← Back to Step 1
                </Button>
              </div>
            </div>
          )}

          {formulaStep === 3 && activeFormula && activeRevision && (!activeRevision.materials || activeRevision.materials.length === 0) && (
            <div className="formula-step-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚖️</div>
              <h3 style={{ fontSize: '18px', color: '#123f61', marginBottom: '8px' }}>
                No Raw Materials Defined
              </h3>
              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '520px', margin: '0 auto 20px auto' }}>
                Formula <strong>{activeFormula.name}</strong> ({activeRevision.name}) has no raw materials defined yet. Add raw materials in Step 2 to generate live batch formulation calculations.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <Button variant="secondary" onClick={() => setFormulaStep(1)}>
                  ← Back to Step 1
                </Button>
                <Button onClick={() => setFormulaStep(2)}>
                  ← Back to Step 2 (Add Materials)
                </Button>
              </div>
            </div>
          )}

          {formulaStep === 3 && activeFormula && activeRevision && activeRevision.materials && activeRevision.materials.length > 0 && (
            <div className="calculation-master-card">
              <div className="calc-card-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
                  <div className="calc-card-title">
                    <div className="calc-icon-badge">⚖️</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0 }}>Step 3: Live Batch Formulation Calculation Engine</h3>
                        {isPendingApproval ? (
                          <span className="qc-status-badge badge-pending">⏳ Pending QA Approval</span>
                        ) : isApproved ? (
                          <span className="qc-status-badge badge-approved">✓ Approved by QA</span>
                        ) : isDeclined ? (
                          <span className="qc-status-badge badge-declined">✕ Declined by QA</span>
                        ) : (
                          <span className="qc-status-badge badge-neutral">⚪ Not Submitted to QA</span>
                        )}
                      </div>
                      <p style={{ marginTop: '4px' }}>
                        Precision stoichiometric scaling with automatic multi-unit conversion and best-fit representation.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button variant="secondary" onClick={() => setFormulaStep(2)}>
                      ← Back to Step 2
                    </Button>
                  </div>
                </div>

                <div className="calc-context-pill-row">
                  <div className="calc-context-pill">
                    Product: <strong>{activeProduct.name}</strong> ({activeProduct.code})
                  </div>
                  <div className="calc-context-pill">
                    Formula: <strong>{activeFormula.name}</strong>
                  </div>
                  <div className="calc-context-pill">
                    Revision: <strong>{activeRevision.name}</strong>
                  </div>
                  <div className="calc-context-pill">
                    Formula Base: <strong>{activeFormula.base_quantity} {activeFormula.base_unit}</strong>
                  </div>
                </div>
              </div>

              {/* Status Banner */}
              {isPendingApproval && activeApproval && (
                <div className="approval-banner banner-pending">
                  <div className="banner-icon">⏳</div>
                  <div className="banner-content">
                    <div className="banner-title">Under Review by Quality Assurance (QA)</div>
                    <div className="banner-desc">
                      Submitted on <strong>{new Date(activeApproval.submittedAt).toLocaleString()}</strong> by{' '}
                      <strong>{activeApproval.submittedBy}</strong> ({activeApproval.submittedByRole || 'Production Chemist'}).
                      Calculation parameters are locked while awaiting QA analytical clearance.
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => setShowWithdrawModal(true)}>
                    Withdraw Request
                  </Button>
                </div>
              )}

              {isApproved && activeApproval && (
                <div className="approval-banner banner-approved">
                  <div className="banner-icon">✓</div>
                  <div className="banner-content">
                    <div className="banner-title">Certified & Approved by Quality Assurance</div>
                    <div className="banner-desc">
                      Approved on <strong>{new Date(activeApproval.decidedAt).toLocaleString()}</strong> by{' '}
                      <strong>{activeApproval.decidedBy}</strong> ({activeApproval.decidedByRole || 'QA Manager'}).
                      {activeApproval.decisionRemarks && (
                        <span> QA Remarks: "<em>{activeApproval.decisionRemarks}</em>"</span>
                      )}
                      — This formulation is locked as the master standard for batch manufacturing.
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => setShowBmrDocModal(true)}>
                    📄 View BMR Requisition Slip
                  </Button>
                </div>
              )}

              {isDeclined && activeApproval && (
                <div className="approval-banner banner-declined">
                  <div className="banner-icon">✕</div>
                  <div className="banner-content">
                    <div className="banner-title">
                      Formulation Calculation Declined by QA
                      {activeApproval.declineCategory ? ` — [${activeApproval.declineCategory}]` : ''}
                    </div>
                    <div className="banner-desc">
                      Declined on <strong>{new Date(activeApproval.decidedAt).toLocaleString()}</strong> by{' '}
                      <strong>{activeApproval.decidedBy}</strong> ({activeApproval.decidedByRole || 'QA Manager'}).
                      <div className="decline-finding-card">
                        <strong>QA Finding:</strong> {activeApproval.declineReason || activeApproval.decisionRemarks}
                      </div>
                      Inputs have been unlocked. You may modify the batch quantity or update revision materials in Step 2, then resubmit for approval.
                    </div>
                  </div>
                  {activeApproval.history && activeApproval.history.length > 1 && (
                    <Button variant="secondary" onClick={() => setShowHistoryModal(true)}>
                      Audit Trail ({activeApproval.history.length})
                    </Button>
                  )}
                </div>
              )}

              {/* Batch Quantity Input Panel */}
              <div className="calc-input-panel">
                <div className="calc-batch-entry">
                  <span className="calc-batch-label">
                    Required Batch Quantity:
                    {(isPendingApproval || isApproved) && (
                      <span className="lock-tag" title="Inputs are locked for submitted/approved formulations">
                        🔒 Locked ({isApproved ? 'Approved Master' : 'In Review'})
                      </span>
                    )}
                  </span>
                  <div className="calc-batch-input-group">
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      className="calc-batch-number-input"
                      value={requiredBatchQty}
                      onChange={(e) => setRequiredBatchQty(e.target.value)}
                      placeholder="e.g. 1"
                      disabled={isPendingApproval || isApproved}
                    />
                    <select
                      className="calc-unit-select"
                      value={requiredBatchUnit}
                      onChange={(e) => setRequiredBatchUnit(e.target.value)}
                      disabled={isPendingApproval || isApproved}
                    >
                      {SUPPORTED_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="calc-multiplier-badge">
                  <span className="scale-label">Batch Scale Factor</span>
                  <span className="scale-val">
                    {currentScaleFactor > 0 ? `${formatPharmaNumber(currentScaleFactor, 3)}×` : '—'}
                  </span>
                </div>
              </div>

              {/* Calculation Live Table */}
              <div className="calc-table-wrapper">
                <table className="calc-table">
                  <thead>
                    <tr>
                      <th>Material Name</th>
                      <th>Unit</th>
                      <th>Base Quantity</th>
                      <th>Required Quantity (Scaled)</th>
                      <th>Formulation Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!requiredBatchQty || Number(requiredBatchQty) <= 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚖️</div>
                          <div style={{ fontWeight: 600, color: '#123f61', marginBottom: '4px' }}>
                            Enter Batch Quantity to Run Calculation
                          </div>
                          <div>Specify a batch quantity above to calculate stoichiometric requirements for this revision.</div>
                        </td>
                      </tr>
                    ) : calculatedMaterials.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                          No raw materials defined in <strong>{activeRevision.name}</strong>. Add materials in Step 2 to generate live batch requirements.
                        </td>
                      </tr>
                    ) : (
                      calculatedMaterials.map((mat) => (
                        <tr key={mat.id}>
                          <td style={{ fontWeight: 600, color: '#123f61' }}>
                            {mat.name}
                          </td>
                          <td>
                            <span className="prd-code-tag">{mat.baseUnit}</span>
                          </td>
                          <td>
                            <strong>{mat.formattedBaseQuantity}</strong>
                          </td>
                          <td>
                            <div>
                              <span className="calc-qty-highlight">
                                {mat.bestFit.formatted}
                              </span>
                              {mat.bestFit.isDifferent && (
                                <span className="calc-qty-sub">
                                  ({mat.formattedRequiredQuantity})
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            {mat.percentage !== null ? (
                              <span className="calc-share-badge">
                                {mat.percentage}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Calculation Summary Footer */}
              {calculatedMaterials.length > 0 && (
                <div className="calc-summary-footer">
                  <div>
                    Batch Target: <strong>{requiredBatchQty} {requiredBatchUnit}</strong> • Total Ingredients:{' '}
                    <strong>{calculatedMaterials.length} Materials</strong>
                  </div>
                  <div>
                    Formula: Required Qty = (Material Base Qty ÷ Formula Base Qty) × Required Batch Qty
                  </div>
                </div>
              )}

              {/* Step 3 Action Bar */}
              <div className="calc-action-bar">
                <div className="action-bar-left">
                  <Button variant="secondary" onClick={() => setFormulaStep(2)}>
                    ← Back to Step 2
                  </Button>
                </div>

                <div className="action-bar-right">
                  {/* Export / Print Dropdown Menu */}
                  <div className="export-dropdown-wrapper">
                    <Button
                      variant="secondary"
                      onClick={() => setShowExportMenu(!showExportMenu)}
                    >
                      📄 Export / Print ▾
                    </Button>

                    {showExportMenu && (
                      <div className="export-menu-dropdown">
                        <button
                          type="button"
                          className="export-menu-item"
                          onClick={() => {
                            setShowExportMenu(false)
                            setShowBmrDocModal(true)
                          }}
                        >
                          <span>👁️</span> Preview BMR Slip
                        </button>
                        <button
                          type="button"
                          className="export-menu-item"
                          onClick={() => {
                            setShowExportMenu(false)
                            setShowBmrDocModal(true)
                            setTimeout(() => exportFormulaPrint(), 400)
                          }}
                        >
                          <span>🖨️</span> Print / Save PDF
                        </button>
                        <button
                          type="button"
                          className="export-menu-item"
                          onClick={() => {
                            setShowExportMenu(false)
                            exportFormulaExcel({
                              product: activeProduct,
                              formula: activeFormula,
                              revision: activeRevision,
                              materials: calculatedMaterials,
                              batchQty: requiredBatchQty,
                              batchUnit: requiredBatchUnit,
                              scaleFactor: currentScaleFactor,
                              approval: activeApproval,
                              companyName: activeCompanyId === 2 ? 'TEJ BIOCARE HEALTHCARE PVT. LTD.' : 'CMHP PHARMACEUTICALS PVT. LTD.',
                            })
                          }}
                        >
                          <span>📊</span> Export to Excel (.xls)
                        </button>
                        <button
                          type="button"
                          className="export-menu-item"
                          onClick={() => {
                            setShowExportMenu(false)
                            exportFormulaCsv({
                              product: activeProduct,
                              formula: activeFormula,
                              revision: activeRevision,
                              materials: calculatedMaterials,
                              batchQty: requiredBatchQty,
                              batchUnit: requiredBatchUnit,
                              approval: activeApproval,
                            })
                          }}
                        >
                          <span>📑</span> Export to CSV
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Primary QA Approval Action Button */}
                  {isPendingApproval ? (
                    <Button
                      variant="danger"
                      onClick={() => setShowWithdrawModal(true)}
                    >
                      ✕ Withdraw Request
                    </Button>
                  ) : isApproved ? (
                    <div className="approved-lock-indicator">
                      <span className="badge-approved-pill">
                        ✓ Approved Manufacturing Standard
                      </span>
                    </div>
                  ) : isDeclined ? (
                    <div className="tooltip-container">
                      <Button
                        variant="primary"
                        onClick={() => {
                          setApprovalRemarks('')
                          setShowApprovalModal(true)
                        }}
                        disabled={!isCalculationValid}
                      >
                        🔄 Resubmit to QA
                      </Button>
                      {!isCalculationValid && (
                        <div className="tooltip-bubble">{calculationInvalidReason}</div>
                      )}
                    </div>
                  ) : (
                    <div className="tooltip-container">
                      <Button
                        variant="primary"
                        onClick={() => {
                          setApprovalRemarks('')
                          setShowApprovalModal(true)
                        }}
                        disabled={!isCalculationValid}
                      >
                        🚀 Get Approval from QA
                      </Button>
                      {!isCalculationValid && (
                        <div className="tooltip-bubble">{calculationInvalidReason}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          MODALS
          ========================================================= */}

      {/* Add / Edit Product Modal */}
      {productModalMode && (
        <Modal
          title={productModalMode === 'add' ? 'Add New Product' : 'Edit Product'}
          onClose={() => setProductModalMode(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setProductModalMode(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveProduct}>
                {productModalMode === 'add' ? 'Create Product' : 'Save Changes'}
              </Button>
            </div>
          }
        >
          <form className="pharma-modal-form" onSubmit={handleSaveProduct}>
            {modalError && <Alert type="error">{modalError}</Alert>}

            <div className="pharma-form-row">
              <label>
                Product Name <span className="req">*</span>
              </label>
              <input
                type="text"
                className="pharma-input"
                placeholder="Enter product name"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                required
              />
            </div>

            <div className="pharma-form-row">
              <label>Product Code</label>
              <input
                type="text"
                className="pharma-input"
                value={productForm.code}
                readOnly
                title="Auto-generated pharmaceutical product code"
              />
            </div>

            <div className="pharma-form-row">
              <label>
                Dosage Form <span className="req">*</span>
              </label>
              <select
                className="pharma-select"
                value={productForm.dosage_form}
                onChange={(e) => setProductForm({ ...productForm, dosage_form: e.target.value })}
              >
                {DOSAGE_FORMS.map((df) => (
                  <option key={df} value={df}>
                    {df}
                  </option>
                ))}
              </select>
            </div>

            <div className="pharma-form-row">
              <label>
                Strength <span className="req">*</span>
              </label>
              <input
                type="text"
                className="pharma-input"
                placeholder="e.g. 500 mg or 125 mg / 5 mL"
                value={productForm.strength}
                onChange={(e) => setProductForm({ ...productForm, strength: e.target.value })}
                required
              />
            </div>

            <div className="pharma-form-row">
              <label>
                Pack Size <span className="req">*</span>
              </label>
              <input
                type="text"
                className="pharma-input"
                placeholder="e.g. 10x10 Tablets Blister or 100 mL Bottle"
                value={productForm.pack_size}
                onChange={(e) => setProductForm({ ...productForm, pack_size: e.target.value })}
                required
              />
            </div>

            <div className="pharma-form-row">
              <label>Description / Therapeutic Indication</label>
              <textarea
                className="pharma-textarea"
                placeholder="e.g. Analgesic and antipyretic oral solid dosage form."
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Product Confirmation Modal */}
      {deleteProductTarget && (
        <Modal
          title="Delete Product"
          onClose={() => setDeleteProductTarget(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setDeleteProductTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDeleteProduct}>
                Confirm Delete
              </Button>
            </div>
          }
        >
          <div>
            <p>
              Are you sure you want to delete product <strong>{deleteProductTarget.name}</strong> (
              {deleteProductTarget.code})?
            </p>
            <Alert type="warning">
              All master formulas, revisions, and raw material associations linked to this product will also be removed.
            </Alert>
          </div>
        </Modal>
      )}

      {/* Product Batch & Production History Modal */}
      {batchHistoryProduct && (
        <Modal
          title={`Production & Batch History — ${batchHistoryProduct.name} (${batchHistoryProduct.code})`}
          onClose={() => setBatchHistoryProduct(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={() => setBatchHistoryProduct(null)}>Close</Button>
            </div>
          }
        >
          <div style={{ minWidth: '600px', maxWidth: '850px' }}>
            {/* Product Meta Header Card */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  {batchHistoryProduct.name}
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                  Code: <strong>{batchHistoryProduct.code}</strong> • Dosage: <strong>{batchHistoryProduct.dosage_form || '—'}</strong> • Pack Size: <strong>{batchHistoryProduct.pack_size || '—'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{
                  background: '#e0f2fe',
                  color: '#0369a1',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600
                }}>
                  {batchHistoryList.length} Batch Record{batchHistoryList.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {batchHistoryLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                <div>Loading production batch records...</div>
              </div>
            ) : batchHistoryList.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '36px 16px',
                background: '#fcfcfc',
                border: '1px dashed #cbd5e1',
                borderRadius: '8px',
                color: '#64748b'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: '14px' }}>
                  No Production Batches Found
                </div>
                <div style={{ fontSize: '12.5px', marginTop: '4px', maxWidth: '420px', margin: '4px auto 0' }}>
                  No manufacturing batch plans or allocated batch numbers exist yet for <strong>{batchHistoryProduct.name}</strong>. Batches are allocated through Sales Orders or the Batch Planning module.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Batch No.</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Plan Ref</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Mfg Date</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Target Output</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Sales Order</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchHistoryList.map((bp) => {
                      const batchNum = bp.allocated_batch_number?.batch_number || bp.batch_number || 'Pending Allocation'
                      const isAllocated = batchNum && batchNum !== 'Pending Allocation'
                      return (
                        <tr key={bp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                            {isAllocated ? (
                              <span style={{
                                background: '#f0fdf4',
                                color: '#166534',
                                border: '1px solid #bbf7d0',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px'
                              }}>
                                {batchNum}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>
                                Not Allocated
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#0369a1', fontWeight: 600 }}>
                            #BP-{bp.id}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>
                            {bp.planned_manufacturing_date || bp.created_at?.slice(0, 10) || '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                            {bp.target_output_quantity} {bp.packing_content_uom_name || bp.output_uom_code || ''}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>
                            {bp.sales_order_number || (bp.sales_order_id ? `#SO-${bp.sales_order_id}` : 'Direct')}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: bp.status === 'COMPLETED' ? '#ecfdf5' : bp.status === 'ALLOCATED' ? '#eff6ff' : '#fefce8',
                              color: bp.status === 'COMPLETED' ? '#065f46' : bp.status === 'ALLOCATED' ? '#1e40af' : '#854d0e',
                              border: `1px solid ${bp.status === 'COMPLETED' ? '#a7f3d0' : bp.status === 'ALLOCATED' ? '#bfdbfe' : '#fde047'}`
                            }}>
                              {bp.status || 'PLANNED'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}





