import { formatDateDDMMYYYY } from './bmrDateUtils.js'

export const SYRUP_BMR_SECTIONS = [
  { id: 1, title: 'Product Details & Attachments Checklist', pageNum: 1 },
  { id: 2, title: 'RM Dispensing Area Line Clearance (Part 1)', pageNum: 2 },
  { id: 3, title: 'RM Clearance (Part 2) & Mfg Area Clearance', pageNum: 3 },
  { id: 4, title: 'Mfg Area Clearance (Part 2) & Equipments', pageNum: 4 },
  { id: 5, title: 'Bulk Manufacturing Process & Release Slips', pageNum: 5 },
  { id: 6, title: 'Liquid Oral Filling Equipment Clearance', pageNum: 6 },
  { id: 7, title: 'Volume Setting & Filling Volume Checks', pageNum: 7 },
  { id: 8, title: 'Uniformity Check, Plugging, Capping & Sealing', pageNum: 8 },
  { id: 9, title: 'Visual Inspection, Measuring Cup & Dispensing', pageNum: 9 },
  { id: 10, title: 'Packing Dispensing Clearance & Environmental', pageNum: 10 },
  { id: 11, title: 'Packing Details, Stereo & Coding Records', pageNum: 11 },
  { id: 12, title: 'Coding Records, Line Clearance & Pasting', pageNum: 12 },
  { id: 13, title: 'Cartoning, Outer Packing & Bonded Slip', pageNum: 13 },
  { id: 14, title: 'Packed Quantity, Reconciliation & QA Inspection', pageNum: 14 },
  { id: 15, title: 'QA Inspection (Cont.) & Final Yield Formula', pageNum: 15 },
  { id: 16, title: 'Accountability Denominator', pageNum: 16 },
  { id: 17, title: 'Carton and Label Specimen Attachment', pageNum: 17 },
  { id: 18, title: 'A) Yield Deviation Justification', pageNum: 18 },
  { id: 19, title: 'B) Procedural Deviation & Final Approvals', pageNum: 19 },
]

export function getSyrupSectionStatus(data, sectionId) {
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
      return hasSign ? 'done' : 'in_progress'
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

export function getEmptySyrupBmrData(orderParam) {
  const order = orderParam || {}
  const productTitle = order.product_name || order.product || order.name || ''
  const productCode = order.product_code || order.code || ''
  const customerName = order.customer_name || order.customer || ''
  const batchNumber = order.batch_no || order.batch || ''
  const mfgDate = order.planned_mfg_date || order.mfg_date || order.order_date || new Date().toISOString().slice(0, 10)
  const compCode = order.company_code || (Number(order.company) === 2 ? 'TB' : 'CMHP')
  const orderNum = order.number || order.order_number || (order.id ? String(order.id).slice(-4) : '01')

  return {
    bmrType: 'syrup',
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
      master_formula_no: order.master_formula_no || `MF-${productCode}`,
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
      expiry_date: '5 YEARS',
      batch_size: order.batch_size || '400 Bottle',
      mfg_started: '',
      mfg_completed: '',
      attachments: {
        rm_requisition: false,
        test_request_bulk: false,
        release_note_bulk: false,
        pm_requisition: false,
        specimen_carton_label: false,
        test_request_finish: false,
        test_report_coa: false,
        finish_transfer_slip: false,
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
      },
    },

    page3: {
      checklist_cont: {
        item7: 'Yes',
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
        { sr: '1', name: 'STROKER', id: 'CM/EQ/PT/01-07', date_cleaned: '', prev_batch: '' },
        { sr: '2', name: 'ALPHEI', id: 'CM/EQ/PT/08', date_cleaned: '', prev_batch: '' },
        { sr: '1B', name: 'Tank (100LTR)', id: 'CM/EQ/PT/09&10', date_cleaned: '', prev_batch: '' },
        { sr: '2', name: 'Filter Cartridge/ Sieve (100#)', id: 'CM/EQ/PT/11', date_cleaned: '', prev_batch: '' },
        { sr: '3', name: '', id: '', date_cleaned: '', prev_batch: '' },
      ],
      cleaned_by_date: '',
      checked_by_date: '',
      verified_by_date: '',
    },

    page5: {
      bulk_processes: [
        { sr: '1', process: 'Alcohol\nPurified Water: 7.1)\npH meter', equip: 'pH meter', eq_id: 'CM/IN/OL/05', date: '', from_time: '', to_time: '' },
        { sr: '2', process: 'Pipette', equip: '', eq_id: 'CM/EQ/PT/01', date: '', from_time: '', to_time: '' },
        { sr: '3', process: 'Filtration of liquid\nCartridge/ Sieve ( 100#)', equip: 'Filter Sieve\n(100#)', eq_id: 'CM/EQ/OL/03', date: '', from_time: '', to_time: '' },
        { sr: '4', process: 'Volume setting', ltrs: '', equip: '', eq_id: '', date: '', from_time: '', to_time: '' },
      ],
      done_by_date: '',
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
      filling_previous_product: '',
      filling_previous_batch_no: '',
      filling_checklist: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
      },
    },

    page6: {
      filling_checklist_cont: {
        item5: 'Yes',
        item6: 'Yes',
      },
      diff_pressure_limit: '',
      checked_by_prod_date: '',
      verified_by_qa_date: '',
      filling_equipments: [
        { sr: '1', name: 'Auto Filling Machine', id: 'CM/EQ/OL/04', date_cleaned: '', prev_batch: '' },
        { sr: '2', name: 'Cylinder and syringes', id: '', date_cleaned: '', prev_batch: '' },
        { sr: '3', name: 'Bottle washing machine', id: '', date_cleaned: '', prev_batch: '' },
        { sr: '4', name: 'PP cap sealing machine', id: '', date_cleaned: '', prev_batch: '' },
        { sr: '5', name: 'Tank', id: 'CM/EQ/OL/02', date_cleaned: '', prev_batch: '' },
        { sr: '6', name: 'Filter Cartridge', id: 'CM/EQ/OL/03', date_cleaned: '', prev_batch: '' },
      ],
      prod_checked_by_date: '',
      qa_verified_by_date: '',
    },

    page7: {
      volume_settings: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
      date_of_filling: '',
      filling_records_p7: [
        { sr: '1', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '2', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '3', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '4', time: '', p1: '', p2: '', p3: '', p4: '' },
      ],
    },

    page8: {
      filling_records_p8: [
        { sr: '5', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '6', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '7', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '8', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '9', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '10', time: '', p1: '', p2: '', p3: '', p4: '' },
      ],
      filled_by: '',
      checked_by_prod: '',
      checked_by_qa: '',
      sealing_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
    },

    page9: {
      visual_inspection: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
      measuring_cup_applicable: 'Applicable',
      measuring_cup_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
      total_inspected_bottles: '',
      checked_by_date: '',
      verified_by_date: '',
      pm_previous_product: '',
      pm_previous_batch_no: '',
      pm_dispensing_clearance: {
        item1: 'Yes',
        item2: 'Yes',
      },
    },

    page10: {
      pm_dispensing_clearance_cont: {
        item3: 'Yes',
        item4: 'Yes',
        item5: 'Yes',
      },
      checked_by_date: '',
      verified_by_date: '',
      env_date: '',
      env_records: [
        { time: '', temp: '27°C', rh: '55%', checked_by_pkg: '', checked_by_qa: '' },
        { time: '', temp: '27°C', rh: '55%', checked_by_pkg: '', checked_by_qa: '' },
      ],
      coding_equipments: [
        { equip: 'Carton Coding Machine', id: 'CM/EQ/PD/02', date_cleaned: '', prev_batch: '', cleaned_by: '' },
        { equip: 'Label Printing Machine', id: 'CM/EQ/PD/02', date_cleaned: '', prev_batch: '', cleaned_by: '' },
      ],
      coding_checked_by_date: '',
      coding_verified_by_date: '',
    },

    page11: {
      packing_type: 'Pet Bottle /Glass Bottle',
      stereo_details: [
        { batch_no: order.batch_no || '', mfg_date: formatDateDDMMYYYY(order.planned_mfg_date || ''), exp_date: '5 YEARS', mrp: order.mrp_for_printing || '', checked_by_pkg: '', checked_by_qa: '' },
        { batch_no: '', mfg_date: '', exp_date: '', mrp: '', checked_by_pkg: '', checked_by_qa: '' },
        { batch_no: '', mfg_date: '', exp_date: '', mrp: '', checked_by_pkg: '', checked_by_qa: '' },
        { batch_no: '', mfg_date: '', exp_date: '', mrp: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      coding_records: [
        { sr: '1', material: '', qty_given: '', qty_rej: '', qty_rec: '' },
        { sr: '2', material: '', qty_given: '', qty_rej: '', qty_rec: '' },
        { sr: '3', material: '', qty_given: '', qty_rej: '', qty_rec: '' },
      ],
    },

    page12: {
      coding_time_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      pkg_previous_product: '',
      pkg_previous_batch_no: '',
      packing_area_clearance: {
        item1: { status: 'Yes', sign_date: '' },
        item2: { status: 'Yes', sign_date: '' },
        item3: { status: 'Yes', sign_date: '' },
        item4: { status: 'Yes', sign_date: '' },
      },
      pkg_verified_by_date: '',
      sticker_label_applicable: 'Applicable',
      pasting_time_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
    },

    page13: {
      cartoning_time_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      outer_packing_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      finish_bottles: '',
      finish_litres: '',
      retain_bottles: '',
      retain_litres: '',
    },

    page14: {
      analysis_bottles: '',
      analysis_litres: '',
      total_packed_bottles: '',
      total_packed_litres: '',
      pm_reconciliation: [
        { sr: '1', material: 'Label', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
        { sr: '2', material: 'Box', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
        { sr: '3', material: 'Inserts', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
        { sr: '4', material: 'Measuring Cap', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
        { sr: '5', material: '', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
        { sr: '6', material: '', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
      ],
      qa_final_inspection: [
        { unit: 'Outer box', checking: 'Quality and Quantity', no_of_unit: '', checked_by: '', checked_by_qa: '' },
      ],
    },

    page15: {
      qa_final_inspection_cont: [
        { unit: 'Inner box', checking: 'Quality and Quantity', no_of_unit: '', checked_by: '', checked_by_qa: '' },
        { unit: 'Carton', checking: 'Quality and Quantity', no_of_unit: '', checked_by: '', checked_by_qa: '' },
        { unit: 'Bottle', checking: 'Quality and Quantity', no_of_unit: '', checked_by: '', checked_by_qa: '' },
      ],
      yield: {
        qty_bsr_nos: '',
        qty_bsr_ltr: '',
        qc_sample_nos: '',
        qc_sample_ltr: '',
        rec_rej_nos: '',
        rec_rej_ltr: '',
        rec_rej_nos_ltr: '',
        non_rec_rej_nos: '',
        non_rec_rej_ltr: '',
        non_rec_rej_nos_ltr: '',
      },
      final_yield_calc: '',
      final_yield_percent: '',
      accountability_calc: '',
      accountability_percent: '',
    },

    page16: {
      final_yield_calc: '',
      final_yield_percent: '',
      accountability_calc: '',
      accountability_percent: '',
      text: 'Batch size',
    },

    page17: {
      specimen_image: null,
      specimen_notes: '',
    },

    page18: {
      yield_deviation_lines: ['', '', '', ''],
      yield_dev_prod_sign: '',
      yield_dev_qa_sign: '',
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
      proc_dev_prod_sign: '',
      proc_dev_qa_sign: '',
    },
  }
}

export function normalizeSyrupBmrData(existingParam = {}, orderParam = {}) {
  const order = orderParam || {}
  const base = getEmptySyrupBmrData(order)
  const existing = (existingParam && existingParam.data !== undefined) ? existingParam.data : existingParam
  if (!existing || typeof existing !== 'object') {
    return base
  }

  const result = {
    ...base,
    ...existing,
    bmrType: 'syrup',
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


  // Sync page15 / page16 formulas for backwards compatibility
  if (!result.page16.final_yield_calc && result.page15?.final_yield_calc) {
    result.page16.final_yield_calc = result.page15.final_yield_calc
    result.page16.final_yield_percent = result.page15.final_yield_percent
    result.page16.accountability_calc = result.page15.accountability_calc
    result.page16.accountability_percent = result.page15.accountability_percent
  } else if (result.page16.final_yield_calc && !result.page15?.final_yield_calc) {
    result.page15.final_yield_calc = result.page16.final_yield_calc
    result.page15.final_yield_percent = result.page16.final_yield_percent
    result.page15.accountability_calc = result.page16.accountability_calc
    result.page15.accountability_percent = result.page16.accountability_percent
  }

  return result
}
