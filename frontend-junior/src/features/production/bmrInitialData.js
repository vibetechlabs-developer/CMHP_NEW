import { formatDateDDMMYYYY } from './bmrDateUtils'
export const BMR_SECTIONS = [
  { id: 1, title: 'Product Details & Attachments Checklist', pageNum: 1 },
  { id: 2, title: 'RM Dispensing Area Line Clearance (Part 1)', pageNum: 2 },
  { id: 3, title: 'RM Clearance (Part 2) & Mfg Area Clearance', pageNum: 3 },
  { id: 4, title: 'Mfg Area Clearance (Part 2) & Equipments', pageNum: 4 },
  { id: 5, title: 'Bulk Manufacturing Process & Release Slips', pageNum: 5 },
  { id: 6, title: 'Filling Area Clearance & Filling Equipments', pageNum: 6 },
  { id: 7, title: 'Sealing, Air Cleaning & Volume Setting', pageNum: 7 },
  { id: 8, title: 'Volume Uniformity, Plugging, Capping & Sealing', pageNum: 8 },
  { id: 9, title: 'Visual Inspection & Measuring Cup Check', pageNum: 9 },
  { id: 10, title: 'Packing Dispensing Clearance & Environmental', pageNum: 10 },
  { id: 11, title: 'Coding Equipment, Packing Details & Stereo', pageNum: 11 },
  { id: 12, title: 'Coding Records & Packing Line Clearance', pageNum: 12 },
  { id: 13, title: 'Cartoning, Outer Packing & Bonded Slip', pageNum: 13 },
  { id: 14, title: 'Packing Yield & PM Reconciliation (Part 1)', pageNum: 14 },
  { id: 15, title: 'PM Reconciliation (Part 2), QA Inspection & Yield', pageNum: 15 },
  { id: 16, title: 'Final Yield & Accountability Formulas', pageNum: 16 },
  { id: 17, title: 'Carton and Label Specimen Attachment', pageNum: 17 },
  { id: 18, title: 'A) Yield Deviation Justification', pageNum: 18 },
  { id: 19, title: 'B) Procedural Deviation & Final Approvals', pageNum: 19 },
]

export function getSectionStatus(data, sectionId) {
  if (!data) return 'not_started'
  const pageKey = `page${sectionId}`
  const pageData = data[pageKey]
  if (!pageData) return 'not_started'

  const footer = data.footers?.[sectionId - 1]
  const hasSign = Boolean(footer?.prepared_signature || footer?.prepared_name)

  // Specific completion checks per section
  switch (sectionId) {
    case 1:
      const attachmentsChecked = Object.values(pageData.attachments || {}).some(Boolean)
      if (hasSign && attachmentsChecked) return 'done'
      if (attachmentsChecked || pageData.mfg_started) return 'in_progress'
      return 'not_started'
    case 2:
      const hasQ2 = Object.values(pageData.checklist || {}).some(Boolean)
      if (hasSign && hasQ2) return 'done'
      return hasQ2 ? 'in_progress' : 'not_started'
    case 17:
      return pageData.specimen_image ? 'done' : 'not_started'
    case 16:
      return pageData.final_yield_percent ? 'done' : 'not_started'
    default:
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

export function getEmptyBmrData(orderParam) {
  const order = orderParam || {}
  const productTitle = order.product_name || order.product || order.name || ''
  const productCode = order.product_code || order.code || ''
  const customerName = order.customer_name || order.customer || ''
  const batchNumber = order.batch_no || order.batch || ''
  const batchQty = order.batch_size || (order.quantity != null ? String(order.quantity) : '')
  const mfgDate = order.planned_mfg_date || order.mfg_date || order.order_date || new Date().toISOString().slice(0, 10)
  const compCode = order.company_code || (Number(order.company) === 2 ? 'TB' : 'CMHP')
  const orderNum = order.number || order.order_number || (order.id ? String(order.id).slice(-4) : '01')

  return {
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
      batch_size: order.batch_size || '1000 LTR',
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
      },
    },

    page3: {
      checklist: {
        item6: 'Yes',
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
      },
    },

    page4: {
      mfg_checklist: {
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
        item5: 'Yes',
        item6: 'Yes',
        item7: 'Yes',
        item8: 'Yes',
      },
      checked_by_prod_date: '',
      verified_by_qa_date: '',
      equipments: [
        { sr: '1', name: 'STROKER', id: 'CM/EQ/PT/01-07', date_cleaned: '', prev_batch: '' },
        { sr: '2', name: 'ALPHEI', id: 'CM/EQ/PT/08', date_cleaned: '', prev_batch: '' },
        { sr: '1B', name: 'TANK(100 LTR )', id: 'CM/EQ/PT/09&10', date_cleaned: '', prev_batch: '' },
        { sr: '2', name: 'Filter Cartridge/ Sieve ( 100#)', id: 'CM/EQ/PT/11', date_cleaned: '', prev_batch: '' },
        { sr: '3', name: '', id: '', date_cleaned: '', prev_batch: '' },
      ],
    },

    page5: {
      cleaned_by_date: '',
      checked_by_date: '',
      verified_by_date: '',
      bulk_processes: [
        { sr: '1', process: 'Alcohol\nPurified Water: 7.1)\npH meter', equip: 'pH meter', eq_id: 'CM/IN/OL/01', date: '', from_time: '', to_time: '' },
        { sr: '2', process: 'Pipette', equip: '', eq_id: 'CM/EQ/PT/01', date: '', from_time: '', to_time: '' },
        { sr: '3', process: 'Filtration of liquid\nCartridge/ Sieve ( 100#)', equip: 'Filter Sieve (100#)', eq_id: 'CM/EQ/OL/03', date: '', from_time: '', to_time: '' },
        { sr: '4', process: 'Volume setting', ltrs: order.batch_size || '1000 LTR', equip: '', eq_id: '', date: '', from_time: '', to_time: '' },
      ],
      done_by_date: '',
      checked_by_prod_date: '',
      verified_by_qa_date: '',
      prod_test_req_date: '',
      prod_test_req_sign: '',
      qa_test_req_date: '',
      qa_test_req_sign: '',
      qc_bulk_release_date: '',
      qc_bulk_release_sign: '',
      qa_bulk_release_date: '',
      qa_bulk_release_sign: '',
    },

    page6: {
      previous_product: '',
      previous_batch_no: '',
      filling_line_clearance: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
        item5: 'Yes',
        item6: 'Yes',
      },
      checked_by_date: '',
      verified_by_date: '',
      filling_equipments: [
        { sr: '1', name: 'Auto Filling Machine', id: 'CM/EQ/OL/04', date_cleaned: '', prev_batch: '' },
        { sr: '2', name: 'Cylinder and syringes', id: '', date_cleaned: '', prev_batch: '' },
        { sr: '3', name: 'Bottle washing machine', id: '', date_cleaned: '', prev_batch: '' },
      ],
    },

    page7: {
      filling_equipments_cont: [
        { sr: '4', name: 'PP cap sealing machine', id: '', date_cleaned: '', prev_batch: '' },
        { sr: '5', name: 'Tank', id: 'CM/EQ/OL/04', date_cleaned: '', prev_batch: '' },
        { sr: '6', name: 'Filter Cartridge', id: 'CM/EQ/OL/04', date_cleaned: '', prev_batch: '' },
      ],
      checked_by_date: '',
      verified_by_date: '',
      volume_settings: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
    },

    page8: {
      date_of_filling: '',
      filling_records: [
        { sr: '1', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '2', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '3', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '4', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '5', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '6', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '7', time: '', p1: '', p2: '', p3: '', p4: '' },
        { sr: '8', time: '', p1: '', p2: '', p3: '', p4: '' },
      ],
      filled_by: '',
      checked_by_prod: '',
      checked_by_qa: '',
    },

    page9: {
      sealing_checks: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
      visual_inspection: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
      measuring_cup_applicable: 'Applicable',
      measuring_cup_checks: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
      total_inspected_bottles: '',
      checked_by_date: '',
      verified_by_date: '',
    },

    page10: {
      previous_product: '',
      previous_batch_no: '',
      packing_dispensing_clearance: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
        item5: 'Yes',
      },
      checked_by_date: '',
      verified_by_date: '',
      environmental_control: [
        { date: '', time: '', temp: '27°C', rh: '55%', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', time: '', temp: '27°C', rh: '55%', checked_by_pkg: '', checked_by_qa: '' },
      ],
      coding_equipments_row1: { equip: '', id: '', date_cleaned: '', prev_batch: '', cleaned_by: '' },
    },

    page11: {
      coding_equipments: [
        { equip: 'Carton Coding Machine', id: 'CM/EQ/PD/02', date_cleaned: '', prev_batch: '', cleaned_by: '' },
        { equip: 'Label Printing Machine', id: 'CM/EQ/PD/02', date_cleaned: '', prev_batch: '', cleaned_by: '' },
        { equip: 'Packing Table', id: 'CM/EQ/PD/11', date_cleaned: '', prev_batch: '', cleaned_by: '' },
      ],
      checked_by_date: '',
      verified_by_date: '',
      packing_type: order.packing_type || 'Pet Bottle',
      stereo_details: [
        {
          batch_no: order.batch_no || '',
          mfg_date: formatDateDDMMYYYY(order.planned_mfg_date || new Date().toISOString().slice(0, 10)),
          exp_date: '5 YEARS',
          mrp: order.mrp_for_printing || (order.unit_price ? String(order.unit_price) : ''),
          checked_by_pkg: '',
          checked_by_qa: '',
        },
        { batch_no: '', mfg_date: '', exp_date: '', mrp: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
    },

    page12: {
      coding_records: [
        { sr: '1', material: 'Label', qty_given: '', qty_rej: '', qty_rec: '' },
        { sr: '2', material: 'Carton', qty_given: '', qty_rej: '', qty_rec: '' },
      ],
      coding_time_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      packing_area_clearance: {
        previous_product: '',
        previous_batch_no: '',
        item1: { status: 'Yes', sign_date: '' },
        item2: { status: 'Yes', sign_date: '' },
        item3: { status: 'Yes', sign_date: '' },
        item4: { status: 'Yes', sign_date: '' },
      },
      verified_by_qa_date: '',
      sticker_label_pasting_applicable: 'Applicable',
    },

    page13: {
      pasting_time_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      cartoning_time_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      outer_packing_records: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      finish_bottles: '',
      finish_litres: '',
    },

    page14: {
      retain_bottles: '',
      retain_litres: '',
      analysis_bottles: '',
      analysis_litres: '',
      total_packed_bottles: '',
      total_packed_litres: '',
      pm_reconciliation: [
        { sr: '1', material: 'Label', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
        { sr: '2', material: 'Box', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
        { sr: '3', material: 'Inserts', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
      ],
    },

    page15: {
      pm_reconciliation_cont: [
        { sr: '4', material: 'Measuring Cap', ar_no: '', issued: '', coding_rej: '', online_rej: '', excess: '', total_rej: '', used: '', returned: '', checked_pkg: '', checked_qa: '' },
      ],
      qa_final_inspection: [
        { unit: 'Outer box', checking: 'Quality and Quantity', no_of_unit: '', checked_by: '', checked_by_qa: '' },
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
        non_rec_rej_nos: '',
        non_rec_rej_ltr: '',
      },
    },

    page16: {
      final_yield_calc: '',
      final_yield_percent: '',
      accountability_calc: '',
      accountability_percent: '',
    },

    page17: {
      specimen_image: null,
      specimen_notes: '',
    },

    page18: {
      yield_deviation_text_1: '',
    },

    page19: {
      yield_deviation_text_2: '',
      yield_dev_prod_sign: '',
      yield_dev_qa_sign: '',
      procedural_deviations: [
        { sr: '1', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '2', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '3', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '4', details: '', action: '', raise_by: '', approved_qa: '' },
      ],
      proc_dev_prod_sign: '',
      proc_dev_qa_sign: '',
    },
  }
}

export function normalizeBmrData(existing = {}, orderParam = {}) {
  const order = orderParam || {}
  const base = getEmptyBmrData(order)
  if (!existing || typeof existing !== 'object') {
    return base
  }

  const result = {
    ...base,
    ...existing,
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

    // Preserve and merge nested object structures
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

  return result
}
