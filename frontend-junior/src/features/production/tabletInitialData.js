import { formatDateDDMMYYYY } from './bmrDateUtils.js'

export const TABLET_BMR_SECTIONS = [
  { id: 1, title: 'Product Details & Attachments Checklist', pageNum: 1 },
  { id: 2, title: 'RM Dispensing Area Line Clearance (Part 1)', pageNum: 2 },
  { id: 3, title: 'RM Clearance (Part 2) & Mfg Area Clearance', pageNum: 3 },
  { id: 4, title: 'Mfg Area Clearance (Part 2) & Equipment', pageNum: 4 },
  { id: 5, title: 'Manufacturing Process of Tablet Bulk', pageNum: 5 },
  { id: 6, title: 'Bulk Release Slips & Mixing of Granules', pageNum: 6 },
  { id: 7, title: 'Compression & Tablet Packing Area Clearance', pageNum: 7 },
  { id: 8, title: 'Packing Area Clearance (Part 2), Dipunch & Weight/Pressure Setting', pageNum: 8 },
  { id: 9, title: 'Test Reports of Tablets', pageNum: 9 },
  { id: 10, title: 'Capping & Visual Inspection', pageNum: 10 },
  { id: 11, title: 'Packing Material Dispensing, Environmental Control & Coding Equipment', pageNum: 11 },
  { id: 12, title: 'Packing Table, Packing Details, Stereo & Coding', pageNum: 12 },
  { id: 13, title: 'Packing Area Line Clearance, Sticker Label Pasting & Cartoning', pageNum: 13 },
  { id: 14, title: 'Outer Packing & PM Reconciliation', pageNum: 14 },
  { id: 15, title: 'QA Final Inspection & Yield', pageNum: 15 },
  { id: 16, title: 'Final Yield (Formula 2)', pageNum: 16 },
  { id: 17, title: 'Specimen of Carton / Label', pageNum: 17 },
  { id: 18, title: 'Yield Deviation', pageNum: 18 },
  { id: 19, title: 'Procedural Deviation', pageNum: 19 },
]

export function getTabletSectionStatus(data, sectionId) {
  if (!data) return 'not_started'
  const pageKey = `page${sectionId}`
  const pageData = data[pageKey]
  if (!pageData) return 'not_started'

  const footer = data.footers?.[sectionId - 1]
  const hasSign = Boolean(footer?.prepared_signature || footer?.prepared_name)

  switch (sectionId) {
    case 1: {
      const attachmentsChecked = Object.values(pageData.attachments || {}).some(Boolean)
      if (hasSign && attachmentsChecked) return 'done'
      if (attachmentsChecked || pageData.mfg_started) return 'in_progress'
      return 'not_started'
    }
    case 2: {
      const hasQ2 = Object.values(pageData.checklist || {}).some(Boolean)
      if (hasSign && hasQ2) return 'done'
      return hasQ2 ? 'in_progress' : 'not_started'
    }
    case 16: {
      const hasContent = Boolean(pageData.accountability_calc || pageData.accountability_percent)
      if (hasSign) return 'done'
      return hasContent ? 'in_progress' : 'not_started'
    }
    case 17: {
      return pageData.specimen_image ? 'done' : hasSign ? 'done' : 'not_started'
    }
    default: {
      if (hasSign) return 'done'
      const values = Object.values(pageData)
      const hasContent = values.some((v) => {
        if (typeof v === 'string') return v.trim().length > 0
        if (Array.isArray(v)) return v.some((r) => Object.values(r).some((cell) => String(cell).trim().length > 0))
        if (typeof v === 'object' && v !== null) return Object.values(v).some(Boolean)
        return false
      })
      return hasContent ? 'in_progress' : 'not_started'
    }
  }
}

export function getEmptyTabletBmrData(orderParam) {
  const order = orderParam || {}
  const productTitle = order.product_name || order.product || order.name || ''
  const productCode = order.product_code || order.code || ''
  const customerName = order.customer_name || order.customer || ''
  const batchNumber = order.batch_no || order.batch || ''
  const mfgDate = order.planned_mfg_date || order.mfg_date || order.order_date || new Date().toISOString().slice(0, 10)
  const compCode = order.company_code || (Number(order.company) === 3 ? 'TEJ' : 'CMHP')
  const orderNum = order.number || order.order_number || (order.id ? String(order.id).slice(-4) : '01')

  return {
    bmrType: 'tablet',
    header: {
      product: productTitle,
      bmr_no: order.bmr_no || `BMR/${compCode}/${new Date().getFullYear().toString().slice(-2)}/${orderNum}`,
      product_code: productCode,
      effective_date: formatDateDDMMYYYY(mfgDate),
      company_code: compCode,
      supersedes_no: order.supersedes_no || '00',
      batch_no: batchNumber,
      version_no: order.version_no || '01',
      mfg_for: customerName,
      master_formula_no: order.master_formula_no || (productCode ? `MF ${productCode}` : ''),
    },

    footers: Array.from({ length: 19 }, () => ({
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
      mfg_date: order.planned_mfg_date || new Date().toISOString().slice(0, 10),
      expiry_date: order.expiry_date || order.best_before || '3 YEARS',
      batch_size: order.batch_size || (order.quantity ? `${order.quantity} Tablet` : ''),
      mfg_started: '',
      mfg_completed: '',
      attachments: {
        item1: false, // RM requisition slip (ATTACHMENT 1)
        item2: false, // Test request slip of bulk product (ATTACHMENT 2)
        item3: false, // Release note of bulk product (ATTACHMENT 3)
        item4: false, // PM requisition slip (ATTACHMENT 4)
        item5: false, // Specimen of mono carton and label
        item6: false, // Test request slip of Finish product (after packing) (ATTACHMENT 5)
        item7: false, // Test report (COA) of finish Product (after packing)
        item8: false, // QA report on inspection and release of finish product
        item9: false, // Finish product transfer slip (ATTACHMENT 6)
      },
    },

    page2: {
      checked_by_date: '',
      verified_by_date: '',
      previous_product: '',
      previous_batch_no: '',
      checklist: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
        item5: 'Yes',
        item6: 'Yes',
        item7: 'Yes',
      },
    },

    page3: {
      checklist_cont: {
        item8: 'Yes',
        item9: 'Yes',
        item10: 'Yes',
      },
      warehouse_checked_by_date: '',
      qa_verified_by_date: '',
      mfg_previous_product: '',
      mfg_previous_batch_no: '',
      mfg_checklist: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
      },
    },

    page4: {
      mfg_checklist_cont: {
        item5: 'Yes',
        item6: 'Yes',
        item7: 'Yes',
        item8: 'Yes',
      },
      diff_pressure_limit: '',
      checked_by_prod_date: '',
      verified_by_qa_date: '',
      equipments: [
        { sr: '1', name: 'Mass Mixture', id: 'CM/EQ/TB/07', date_cleaned: '', prev_batch: '' },
        { sr: '2', name: 'Multi Mill', id: 'CM/EQ/TB/08', date_cleaned: '', prev_batch: '' },
        { sr: '3', name: 'Tray Dryer –Autotimer and Thermostatic (36 Aluminum Trays)', id: 'CM/EQ/TB/06', date_cleaned: '', prev_batch: '' },
        { sr: '4', name: 'Tablet Punching Machine ( 27 Station Double Rotary)', id: 'CM/EQ/TB/05', date_cleaned: '', prev_batch: '' },
      ],
      cleaned_by_date: '',
      checked_by_date: '',
      verified_by_date: '',
    },

    page5: {
      bulk_processes: [
        { sr: '1', process: 'Mixing and Binding of powders', equip: 'Mass Mixture', eq_id: 'CM/EQ/TB/07', date: '', from_time: '', to_time: '' },
        { sr: '2', process: 'Granulation of powder', equip: 'Multi Mill', eq_id: 'CM/EQ/TB/08', date: '', from_time: '', to_time: '' },
        { sr: '3', process: 'Drying of wet granules', equip: 'Tray Dryer –Autotimer and Thermostatic (36 Aluminum Trays)', eq_id: 'CM/EQ/TB/06', date: '', from_time: '', to_time: '' },
      ],
    },

    page6: {
      bulk_cont_empty: true,
      checked_by_date: '',
      verified_by_date: '',
      prod_test_req_date: '',
      prod_test_req_sign: '',
      qa_test_req_date: '',
      qa_test_req_sign: '',
      qc_bulk_release_date: '',
      qc_bulk_release_sign: '',
      qa_bulk_release_date: '',
      qa_bulk_release_sign: '',
      mixing_records: [
        { sr: '1', process: 'Mixing of dried granules', equip: 'Mass Mixture', eq_id: 'CM/EQ/TB/07', date: '', from_time: '', to_time: '' },
      ],
    },

    page7: {
      compression_records: [
        { sr: '1', process: 'Compression of dried granules', equip: 'Tablet Punching Machine (27 Station Double Rotary)', eq_id: 'CM/EQ/TB/05', date: '', from_time: '', to_time: '' },
      ],
      checked_by_date: '',
      verified_by_date: '',
      prod_inprocess_date: '',
      prod_inprocess_sign: '',
      qa_inprocess_date: '',
      qa_inprocess_sign: '',
      qc_inprocess_release_date: '',
      qc_inprocess_release_sign: '',
      qa_inprocess_release_date: '',
      qa_inprocess_release_sign: '',
      packing_previous_product: '',
      packing_previous_batch_no: '',
      packing_checklist: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
      },
    },

    page8: {
      packing_checklist_cont: {
        item5: 'Yes',
        item6: 'Yes',
      },
      diff_pressure_limit: '',
      checked_by_date: '',
      verified_by_date: '',
      dipunch_settings: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_prod: '', checked_qa: '' },
      ],
      weight_pressure_settings: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_prod: '', checked_qa: '' },
      ],
    },

    page9: {
      test_reports: Array.from({ length: 10 }, (_, i) => ({
        sr: `${i + 1}.`,
        weight_lhs: '',
        weight_rhs: '',
        diam_lhs: '',
        diam_rhs: '',
        thick_lhs: '',
        thick_rhs: '',
      })),
      filled_by: '',
      checked_by_prod_date: '',
      checked_by_qa_date: '',
      liner_seal_applicable: 'Applicable',
    },

    page10: {
      capping_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_prod: '', checked_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_prod: '', checked_qa: '' },
      ],
      visual_inspection_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_prod: '', checked_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_prod: '', checked_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_prod: '', checked_qa: '' },
      ],
      total_inspected_bottles: '',
      visual_inspection_records_2: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_prod: '', checked_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_prod: '', checked_qa: '' },
      ],
      checked_by_date: '',
      verified_by_date: '',
    },

    page11: {
      previous_product: '',
      previous_batch_no: '',
      pm_dispensing_checklist: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
        item5: 'Yes',
      },
      checked_by_date: '',
      verified_by_date: '',
      env_records: [
        { date: '', time: '', temp: '', rh: '', checked_pkg: '', checked_qa: '' },
        { date: '', time: '', temp: '', rh: '', checked_pkg: '', checked_qa: '' },
      ],
      coding_equipments: [
        { equip: 'Carton Coding Machine', id: 'CM/EQ/PD/02', date_cleaned: '', prev_batch: '', cleaned_by: '' },
        { equip: 'Label Printing Machine', id: 'CM/EQ/PD/02', date_cleaned: '', prev_batch: '', cleaned_by: '' },
      ],
    },

    page12: {
      packing_table: { equip: 'Packing Table', id: 'CM/EQ/PD/11', date_cleaned: '', prev_batch: '', cleaned_by: '' },
      checked_by_date: '',
      verified_by_date: '',
      packing_type: '',
      stereo_applicable: 'Applicable',
      stereo_details: [
        { batch_no: order.batch_no || '', mfg_date: formatDateDDMMYYYY(order.planned_mfg_date || ''), exp_date: order.expiry_date || '3 YEARS', mrp: order.mrp_for_printing || '', checked_pkg: '', checked_qa: '' },
        { batch_no: '', mfg_date: '', exp_date: '', mrp: '', checked_pkg: '', checked_qa: '' },
      ],
      coding_applicable: 'Applicable',
      coding_materials: [
        { sr: '1', material: '', qty_given: '', qty_rej: '', qty_rec: '' },
        { sr: '2', material: '', qty_given: '', qty_rej: '', qty_rec: '' },
      ],
      coding_times: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_pkg: '', checked_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_pkg: '', checked_qa: '' },
      ],
    },

    page13: {
      previous_product: '',
      previous_batch_no: '',
      packing_area_checklist: {
        item1: { status: 'Yes', sign_date: '' },
        item2: { status: 'Yes', sign_date: '' },
        item3: { status: 'Yes', sign_date: '' },
        item4: { status: 'Yes', sign_date: '' },
      },
      verified_by_date: '',
      sticker_label_applicable: 'Applicable',
      pasting_times: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_pkg: '', checked_qa: '' },
      ],
    },

    page14: {
      cartoning_times: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_pkg: '', checked_qa: '' },
      ],
      outer_packing_times: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_pkg: '', checked_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_pkg: '', checked_qa: '' },
      ],
      finish_bottles: '',
      finish_bottles_val: '',
      retain_bottles: '',
      retain_bottles_val: '',
      analysis_bottles: '',
      analysis_bottles_val: '',
      total_packed_bottles: '',
      total_packed_bottles_val: '',
      pm_reconciliation: [
        { sr: '1', material: 'Label', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
        { sr: '2', material: 'Box', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
      ],
    },

    page15: {
      pm_reconciliation_cont: [
        { sr: '3', material: 'Inserts', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
        { sr: '4', material: 'Ved', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
      ],
      qa_final_inspections: [
        { unit: 'Outer box', checking: 'Quality and Quantity', no_of_unit: '', checked_by: '', checked_by_qa: '' },
        { unit: 'Inner box', checking: 'Quality and Quantity', no_of_unit: '', checked_by: '', checked_by_qa: '' },
        { unit: 'Carton', checking: 'Quality and Quantity', no_of_unit: '', checked_by: '', checked_by_qa: '' },
        { unit: 'Bottle', checking: 'Quality and Quantity', no_of_unit: '', checked_by: '', checked_by_qa: '' },
      ],
      qa_release_slip_no: '',
      qa_release_time_date: '',
      yield_a: '',
      yield_b: '',
      yield_c: '',
      yield_d: '',
      final_yield_calc: '',
      final_yield_percent: '',
    },

    page16: {
      accountability_calc: '',
      accountability_percent: '',
    },

    page17: {
      specimen_image: null,
      specimen_notes: '',
    },

    page18: {
      yield_deviation_lines: ['', '', '', ''],
      prepared_by_date: '',
      approved_by_date: '',
    },

    page19: {
      procedural_deviations: [
        { sr: '1', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '2', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '3', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '4', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '5', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '6', details: '', action: '', raise_by: '', approved_qa: '' },
      ],
      prepared_by_date: '',
      approved_by_date: '',
    },
  }
}

export function normalizeTabletBmrData(existingParam = {}, orderParam = {}) {
  const order = orderParam || {}
  const base = getEmptyTabletBmrData(order)
  const existing = (existingParam && existingParam.data !== undefined) ? existingParam.data : existingParam
  if (!existing || typeof existing !== 'object') {
    return base
  }

  const result = {
    ...base,
    ...existing,
    bmrType: 'tablet',
    header: {
      ...base.header,
      ...(existing.header || {}),
    },
    footers: Array.from({ length: 19 }, (_, idx) => ({
      ...(base.footers[idx] || {}),
      ...(existing.footers?.[idx] || {}),
    })),
  }

  for (let i = 1; i <= 19; i++) {
    const key = `page${i}`
    const basePage = base[key] || {}
    const existingPage = existing[key] || {}

    const mergedPage = { ...basePage, ...existingPage }

    Object.keys(basePage).forEach((subKey) => {
      const baseVal = basePage[subKey]
      const existVal = existingPage[subKey]
      if (Array.isArray(baseVal)) {
        mergedPage[subKey] = Array.isArray(existVal) && existVal.length > 0 ? existVal : baseVal
      } else if (baseVal !== null && typeof baseVal === 'object') {
        mergedPage[subKey] = {
          ...baseVal,
          ...(existVal || {}),
        }
      }
    })

    result[key] = mergedPage
  }

    // Sanitize Page 11 env_records defaults
  if (result.page11 && Array.isArray(result.page11.env_records)) {
    result.page11.env_records = result.page11.env_records.map((r) => ({
      ...r,
      temp: (r.temp === '27°C' || r.temp === '27℃') ? '' : (r.temp || ''),
      rh: (r.rh === '55%' || r.rh === '55% ± 2%') ? '' : (r.rh || ''),
    }))
  }

  // Sanitize Page 12 packing_type default duplication
  if (result.page12 && (result.page12.packing_type === 'Pet Bottle /Glass Bottle:' || result.page12.packing_type === 'Pet Bottle / Glass Bottle:')) {
    result.page12.packing_type = ''
  }

  return result
}
