import { formatDateDDMMYYYY } from './bmrDateUtils.js'

export const MOTHER_TINCTURE_BMR_SECTIONS = [
  { id: 1, title: 'Product Details & Attachments Checklist', pageNum: 1 },
  { id: 2, title: 'RM Dispensing Area Line Clearance (Part 1)', pageNum: 2 },
  { id: 3, title: 'RM Clearance (Part 2) & Mfg Area Clearance', pageNum: 3 },
  { id: 4, title: 'Mfg Area Clearance (Part 2) & Mother Tincture Process', pageNum: 4 },
  { id: 5, title: 'Yield Loss & Deviations', pageNum: 5 },
  { id: 6, title: 'Sign-off Page', pageNum: 6 },
]

export function getMotherTinctureSectionStatus(data, sectionId) {
  if (!data) return 'not_started'
  const pageKey = `page${sectionId}`
  const pageData = data[pageKey]
  if (!pageData) return 'not_started'

  const footer = data.footers?.[sectionId - 1]
  const hasSign = Boolean(footer?.prepared_signature || footer?.prepared_name)

  switch (sectionId) {
    case 1: {
      const attachmentsChecked = Object.values(pageData.attachments || {}).some(Boolean)
      const hasDetails = Boolean(
        pageData.herb_name ||
        pageData.herb_quantity ||
        pageData.alcohol_quantity ||
        pageData.water_quantity ||
        pageData.total_volume ||
        pageData.alcohol_percentage ||
        pageData.process_date
      )
      if (hasSign && attachmentsChecked) return 'done'
      if (attachmentsChecked || hasDetails) return 'in_progress'
      return 'not_started'
    }
    case 2: {
      const checkedCount = Object.values(pageData.checklist || {}).filter(Boolean).length
      if (hasSign && checkedCount >= 7) return 'done'
      if (checkedCount > 0 || pageData.checked_by_date || pageData.verified_by_date || pageData.previous_product || pageData.batch_no) {
        return 'in_progress'
      }
      return 'not_started'
    }
    case 3: {
      const countP3 = Object.values(pageData.checklist || {}).filter(Boolean).length +
        Object.values(pageData.mfg_checklist || {}).filter(Boolean).length
      if (hasSign && countP3 >= 6) return 'done'
      if (countP3 > 0 || pageData.checked_by_warehouse || pageData.verified_by_qa || pageData.previous_product_mfg) {
        return 'in_progress'
      }
      return 'not_started'
    }
    case 4: {
      const hasProcess = Boolean(
        pageData.process?.herb_text ||
        pageData.process?.alcohol_text ||
        pageData.process?.soaking_date ||
        pageData.total_volume_a
      )
      if (hasSign && hasProcess) return 'done'
      if (hasProcess || pageData.checked_by_production || pageData.verified_by_qa) return 'in_progress'
      return 'not_started'
    }
    case 5: {
      const hasYield = Boolean(pageData.filter_qty_b || pageData.yield_percent || pageData.yield_deviation_reason)
      if (hasSign && hasYield) return 'done'
      if (hasYield || pageData.yield_prepared_by || pageData.yield_approved_by) return 'in_progress'
      return 'not_started'
    }
    case 6: {
      const hasContent = Boolean(pageData.prepared_by || pageData.approved_by || hasSign)
      if (hasSign && (pageData.prepared_by || pageData.approved_by)) return 'done'
      return hasContent ? 'in_progress' : 'not_started'
    }
    default:
      return 'not_started'
  }
}

export function getEmptyMotherTinctureBmrData(orderParam) {
  const order = orderParam || {}
  const productTitle = order.product_name || order.product || order.name || ''
  const productCode = order.product_code || order.code || ''
  const batchNumber = order.batch_no || order.batch || ''
  const compCode = order.company_code || (Number(order.company) === 3 ? 'TEJ' : 'CMHP')
  const orderNum = order.number || order.order_number || (order.id ? String(order.id).slice(-4) : '01')
  const defaultBmrNo = order.bmr_no || `BMR/${compCode}/${new Date().getFullYear().toString().slice(-2)}/${orderNum}`

  return {
    bmrType: 'mother_tincture',
    header: {
      product: productTitle,
      bmr_no: defaultBmrNo,
      product_code: productCode,
      effective_date: '05/01/2025',
      supersedes_no: '00',
      batch_no: batchNumber,
      version_no: '01',
      mfg_for: 'CMHP',
    },

    footers: Array.from({ length: 6 }, () => ({
      prepared_name: '',
      prepared_signature: '',
      prepared_date: '',
      reviewed_name: '',
      reviewed_signature: '',
      reviewed_date: '',
      approved_name: '',
      approved_signature: '',
      approved_date: '',
    })),

    page1: {
      herb_name: '',
      process_date: '',
      best_use_before: '7 YEARS FROM THE DATE OF MANUFACTURING',
      herb_quantity: '',
      alcohol_quantity: '',
      water_quantity: '',
      total_volume: '',
      alcohol_percentage: '',
      attachments: {
        item1: false,
        item2: false,
        item3: false,
        item4: false,
        item5: false,
      },
    },

    page2: {
      checked_by_date: '',
      verified_by_date: '',
      previous_product: '',
      batch_no: '',
      checklist: {
        item1: '',
        item2: '',
        item3: '',
        item4: '',
        item5: '',
        item6: '',
        item7: '',
      },
    },

    page3: {
      checklist: {
        item8: '',
        item9: '',
      },
      checked_by_warehouse: '',
      verified_by_qa: '',
      previous_product_mfg: '',
      batch_no_mfg: '',
      mfg_checklist: {
        item1: '',
        item2: '',
        item3: '',
        item4: '',
      },
    },

    page4: {
      mfg_checklist: {
        item5: '',
        item6: '',
        item7: '',
        item8: '',
      },
      dp_limit: '',
      checked_by_production: '',
      verified_by_qa: '',
      process: {
        herb_text: '',
        alcohol_text: '',
        water_text: '',
        soaking_date: '',
        filtration_date: '',
        filtration_from: '',
        filtration_to: '',
        filtration_total_time: '',
        make_up_alcohol_qty: '',
        make_up_water_qty: '',
      },
      cleaned_by_production: '',
      process_verified_by_qa: '',
      process_checked_by_production: '',
      total_volume_a: '',
    },

    page5: {
      filter_qty_b: '',
      yield_calc: '',
      yield_percent: '',
      yield_deviation_reason: '',
      yield_prepared_by: '',
      yield_approved_by: '',
      procedural_deviations: [
        { sr_no: '1', details: '', corrective_action: '', raise_by: '', approved_by: '' },
        { sr_no: '2', details: '', corrective_action: '', raise_by: '', approved_by: '' },
        { sr_no: '3', details: '', corrective_action: '', raise_by: '', approved_by: '' },
      ],
    },

    page6: {
      prepared_by: '',
      approved_by: '',
    },
  }
}

export function normalizeMotherTinctureBmrData(raw, order) {
  const empty = getEmptyMotherTinctureBmrData(order)
  if (!raw || typeof raw !== 'object') return empty

  const mergedHeader = {
    ...empty.header,
    ...(raw.header || {}),
  }

  // Auto-fetch dynamic fields from order if empty in raw header
  if (order) {
    if (!mergedHeader.product) mergedHeader.product = order.product_name || order.product || ''
    if (!mergedHeader.product_code) mergedHeader.product_code = order.product_code || order.code || ''
    if (!mergedHeader.batch_no) mergedHeader.batch_no = order.batch_no || order.batch || ''
    if (!mergedHeader.bmr_no && empty.header.bmr_no) mergedHeader.bmr_no = empty.header.bmr_no
  }

  // Effective Date, Version, Supersedes, and Mfg For have PDF defaults
  if (!mergedHeader.effective_date) mergedHeader.effective_date = '05/01/2025'
  if (!mergedHeader.version_no) mergedHeader.version_no = '01'
  if (!mergedHeader.supersedes_no) mergedHeader.supersedes_no = '00'
  if (!mergedHeader.mfg_for) mergedHeader.mfg_for = 'CMHP'

  const mergedFooters = Array.from({ length: 6 }, (_, idx) => {
    const existing = raw.footers?.[idx] || {}
    const def = empty.footers[idx]
    return { ...def, ...existing }
  })

  return {
    ...empty,
    ...raw,
    bmrType: 'mother_tincture',
    header: mergedHeader,
    footers: mergedFooters,
    page1: {
      ...empty.page1,
      ...(raw.page1 || {}),
      attachments: {
        ...empty.page1.attachments,
        ...(raw.page1?.attachments || {}),
      },
    },
    page2: {
      ...empty.page2,
      ...(raw.page2 || {}),
      checklist: {
        ...empty.page2.checklist,
        ...(raw.page2?.checklist || {}),
      },
    },
    page3: {
      ...empty.page3,
      ...(raw.page3 || {}),
      checklist: {
        ...empty.page3.checklist,
        ...(raw.page3?.checklist || {}),
      },
      mfg_checklist: {
        ...empty.page3.mfg_checklist,
        ...(raw.page3?.mfg_checklist || {}),
      },
    },
    page4: {
      ...empty.page4,
      ...(raw.page4 || {}),
      mfg_checklist: {
        ...empty.page4.mfg_checklist,
        ...(raw.page4?.mfg_checklist || {}),
      },
      process: {
        ...empty.page4.process,
        ...(raw.page4?.process || {}),
      },
    },
    page5: {
      ...empty.page5,
      ...(raw.page5 || {}),
      procedural_deviations: Array.isArray(raw.page5?.procedural_deviations) && raw.page5.procedural_deviations.length === 3
        ? raw.page5.procedural_deviations
        : empty.page5.procedural_deviations,
    },
    page6: {
      ...empty.page6,
      ...(raw.page6 || {}),
    },
  }
}
