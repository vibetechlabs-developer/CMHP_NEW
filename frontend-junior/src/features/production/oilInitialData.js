import { formatDateDDMMYYYY } from './bmrDateUtils.js'

export const OIL_BMR_SECTIONS = [
  { id: 1, title: 'Product Data & Check List of Attachments', pageNum: 1 },
  { id: 2, title: 'Raw Material Dispensing Area Line Clearance (Part 1)', pageNum: 2 },
  { id: 3, title: 'RM Line Clearance (Part 2) & Manufacturing Area Line Clearance (Part 1)', pageNum: 3 },
  { id: 4, title: 'Manufacturing Area Line Clearance (Part 2) & Oil Manufacturing Equipment', pageNum: 4 },
  { id: 5, title: 'Manufacturing Process of Bulk & Release Slips', pageNum: 5 },
  { id: 6, title: 'Oil Filling Area Line Clearance & Equipment Clearance Header', pageNum: 6 },
  { id: 7, title: 'Filling Equipment Clearance, Bottle Cleaning, Volume Setting & Filling Record', pageNum: 7 },
  { id: 8, title: 'Filling Record (Cont.), Capping, Sealing & Visual Inspection Heading', pageNum: 8 },
  { id: 9, title: 'Visual Inspection & Packing Material Dispensing Line Clearance', pageNum: 9 },
  { id: 10, title: 'Environmental Control & Equipment Clearance for Coding', pageNum: 10 },
  { id: 11, title: 'Stereo Details & Label / Carton Coding', pageNum: 11 },
  { id: 12, title: 'Coding Records, Packing Area Line Clearance & Sticker Label Pasting', pageNum: 12 },
  { id: 13, title: 'Cartoning, Outer Packing & Bonded Slip', pageNum: 13 },
  { id: 14, title: 'Packing Material Reconciliation & QA Final Inspection (Part 1)', pageNum: 14 },
  { id: 15, title: 'QA Final Inspection (Bottle), Finish Product Transfer & Final Yield / Accountability', pageNum: 15 },
  { id: 16, title: 'Approved Specimen Attachment of Carton / Label', pageNum: 16 },
  { id: 17, title: 'Blank Page (Master Copy Record)', pageNum: 17 },
  { id: 18, title: 'Deviation: A) Yield Deviation & B) Procedural Deviation', pageNum: 18 },
  { id: 19, title: 'Procedural Deviation Continuation & Final Sign-off', pageNum: 19 },
]

export function getOilSectionStatus(data, sectionId) {
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
      const hasQ2 = Object.values(pageData.line_clearance_p2 || {}).some(Boolean)
      if (hasSign && hasQ2) return 'done'
      return hasQ2 ? 'in_progress' : 'not_started'
    }
    case 16: {
      return pageData.specimen_image ? 'done' : hasSign ? 'done' : 'not_started'
    }
    case 17: {
      return hasSign ? 'done' : 'not_started'
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

export function getEmptyOilBmrData(orderParam) {
  const order = orderParam || {}
  const productTitle = order.product_name || order.product || order.name || 'Eucalyptus Pain Relief Oil'
  const productCode = order.product_code || order.code || 'PRD-0006'
  const customerName = order.customer_name || order.customer || 'Apollo Pharmacy Ltd'
  const batchNumber = order.batch_no || order.batch || 'BAT-2026-0006'
  const mfgDate = order.planned_mfg_date || order.mfg_date || order.order_date || new Date().toISOString().slice(0, 10)
  const compCode = order.company_code || (Number(order.company) === 3 ? 'TEJ' : 'CMHP')
  const orderNum = order.number || order.order_number || (order.id ? String(order.id).slice(-4) : '06')

  return {
    bmrType: 'oil',
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
      mfg_date: formatDateDDMMYYYY(order.planned_mfg_date || order.mfg_date || new Date().toISOString().slice(0, 10)),
      expiry_date: '5 YEARS',
      batch_size: order.batch_size ? String(order.batch_size) : '1000',
      mfg_started: '',
      mfg_completed: '',
      attachments: {
        att1: false, // 1 RM requisition slip (ATTACHMENT 1)
        att2: false, // 2 Test request slip of bulk product (ATTACHMENT 2)
        att3: false, // 3 Release note of bulk product (ATTACHMENT 3)
        att4: false, // 4 PM requisition slip (ATTACHMENT 4)
        att5: false, // 5 Specimen of mono carton and label
        att6: false, // 6 Test request slip of Finish product (after packing) (ATTACHMENT 5)
        att7: false, // 7 Test report (COA) of finish Product (after packing)
        att8: false, // 8 QA report on inspection and release of finish product
        att9: false, // 9 Finish product transfer slip (ATTACHMENT 6)
      },
    },

    page2: {
      checked_by_date: '',
      verified_by_date: '',
      previous_product: '',
      previous_batch_no: '',
      line_clearance_p2: {
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
      line_clearance_p3: {
        item8: 'Yes',
        item9: 'Yes',
        item10: 'Yes',
      },
      warehouse_checked_by_date: '',
      qa_verified_by_date: '',
      mfg_previous_product: '',
      mfg_previous_batch_no: '',
      mfg_area_clearance_p3: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
      },
    },

    page4: {
      mfg_area_clearance_p4: {
        item5: 'Yes',
        item6: 'Yes',
      },
      mfg_checked_by_prod_date: '',
      mfg_verified_by_qa_date: '',
      oil_mfg_equipments: [
        { sr: '1', name: 'HEATING TANK', id: '', date_cleaned: '', prev_batch: '' },
        { sr: '2', name: 'Filing tank SS Tank', id: '', date_cleaned: '', prev_batch: '' },
        { sr: '3', name: 'Sieve (100 #)', id: '', date_cleaned: '', prev_batch: '' },
        { sr: '', name: '', id: '', date_cleaned: '', prev_batch: '' },
        { sr: '', name: '', id: '', date_cleaned: '', prev_batch: '' },
      ],
      cleaned_by_prod_date: '',
      checked_by_prod_date: '',
      verified_by_qa_date: '',
    },

    page5: {
      bulk_processes: [
        { sr: '1', process: 'Addition of herbin oil in\nHeating tank (200LTR)', equip: 'Heating tank', eq_id: '', date: '', from_time: '', to_time: '' },
        { sr: '2', process: 'Boiling of Oil', equip: 'Heating tank', eq_id: '', date: '', from_time: '', to_time: '' },
        { sr: '3', process: 'Cooling of Oil', equip: 'Heating tank', eq_id: '', date: '', from_time: '', to_time: '' },
        { sr: '4', process: 'Filtering of oil through\nSieve ( 100#)', equip: 'Sieve (100#)', eq_id: '', date: '', from_time: '', to_time: '' },
        { sr: '5', process: 'Addition and mixing of\nexpient in filtrate tank\nandVolume make up', equip: 'SS Tank (600\nltr)', eq_id: '', date: '', from_time: '', to_time: '' },
        { sr: '6', process: 'Final filteration by\n(100#)Sieve', equip: 'PVC Tank', eq_id: '', date: '', from_time: '', to_time: '' },
      ],
      done_by_prod_date: '',
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
      filling_prev_product: '',
      filling_prev_batch_no: '',
      filling_area_clearance: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
        item5: 'Yes',
        item6: 'Yes',
      },
      diff_pressure_limit: '',
      checked_by_prod_date: '',
      verified_by_qa_date: '',
    },

    page7: {
      filling_equipments: [
        { sr: '1', name: 'Auto Filling Machine', id: 'CM/EQ/OL/04', date_cleaned: '', prev_batch: '', is_shaded: false },
        { sr: '2', name: 'Cylinder and syringes', id: '', date_cleaned: '', prev_batch: '', is_shaded: true },
        { sr: '3', name: 'PP cap sealing machine', id: '', date_cleaned: '', prev_batch: '', is_shaded: true },
        { sr: '4', name: 'Tank', id: 'CM/EQ/OL/04', date_cleaned: '', prev_batch: '', is_shaded: false },
      ],
      checked_by_prod_date: '',
      verified_by_qa_date: '',
      volume_setting: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' }
      ],
      filling_record_date: '',
      filling_records_p7: [
        { sr: '1', time: '', pump1: '' },
        { sr: '2', time: '', pump1: '' },
        { sr: '3', time: '', pump1: '' },
      ],
    },

    page8: {
      filling_records_p8: [
        { sr: '4', time: '', pump1: '' },
        { sr: '5', time: '', pump1: '' },
        { sr: '6', time: '', pump1: '' },
        { sr: '7', time: '', pump1: '' },
        { sr: '8', time: '', pump1: '' },
      ],
      filled_by: '',
      checked_by_prod_date: '',
      checked_by_qa_date: '',
      capping_sealing: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' }
      ],
    },

    page9: {
      visual_inspection_table1: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
      total_inspected_bottles: '',
      visual_inspection_table2: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
      ],
      checked_by_prod_date: '',
      verified_by_qa_date: '',
      pm_disp_prev_product: '',
      pm_disp_prev_batch: '',
      pm_disp_clearance: {
        item1: 'Yes',
        item2: 'Yes',
        item3: 'Yes',
        item4: 'Yes',
        item5: 'Yes',
      },
    },

    page10: {
      checked_by_packing_date: '',
      verified_by_qa_date: '',
      environmental_control: [
        { date: '', time_hrs: '', temp: '', rh: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', time_hrs: '', temp: '', rh: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      equipment_clearance: [
        { equip: 'Carton Coding Machine', id: 'CM/EQ/PD/02', date_cleaned: '', prev_batch: '', cleaned_by: '' },
        { equip: 'Label Printing Machine', id: 'CM/EQ/PD/02', date_cleaned: '', prev_batch: '', cleaned_by: '' },
        { equip: 'Packing Table', id: 'CM/EQ/PD/11', date_cleaned: '', prev_batch: '', cleaned_by: '' },
      ],
      equip_checked_by_pkg_date: '',
      equip_verified_by_qa_date: '',
    },

    page11: {
      packing_type: '',
      stereo_details: [
        { batch_no: batchNumber, mfg_date: formatDateDDMMYYYY(mfgDate), exp_date: '5 YEARS', mrp: '', checked_by_pkg: '', checked_by_qa: '' },
        { batch_no: '', mfg_date: '', exp_date: '', mrp: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      coding_records: [
        { sr: '1', material: 'Label', qty_given: '', qty_rej: '', qty_rec: '' },
        { sr: '2', material: 'Carton', qty_given: '', qty_rej: '', qty_rec: '' },
      ],
      coding_time_records_p11: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' }
      ],
    },

    page12: {
      coding_time_records_p12: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      pkg_area_prev_product: '',
      pkg_area_prev_batch: '',
      pkg_area_clearance: [
        { sr: '1', activity: 'Previous product / batch materials are removed', status: 'Yes', checked_by_sign_date: '' },
        { sr: '2', activity: 'Previous product/ batch labels are removed', status: 'Yes', checked_by_sign_date: '' },
        { sr: '3', activity: 'Floor, walls, and ceiling are cleaned', status: 'Yes', checked_by_sign_date: '' },
        { sr: '4', activity: 'Status labels are affixed', status: 'Yes', checked_by_sign_date: '' },
      ],
      pkg_verified_by_qa_date: '',
      sticker_pasting_applicable: 'Applicable',
      sticker_pasting_time: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' }
      ],
    },

    page13: {
      cartoning_time: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' }
      ],
      outer_packing_time: [
        { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' }
      ],
      bonded_slip: {
        finish_bottles: '',
        finish_litres: '',
        retain_bottles: '',
        retain_litres: '',
        analysis_bottles: '',
        analysis_litres: '',
        total_bottles: '',
        total_litres: '',
      },
    },

    page14: {
      pm_reconciliation: [
        { sr: '1', material: 'Label', ar_no: '', qty_issued: '', rej_coding: '', rej_online: '', rej_excess: '', rej_total: '', qty_used: '', qty_returned: '', checked_by_pkg: '', checked_by_qa: '' },
        { sr: '2', material: 'Box', ar_no: '', qty_issued: '', rej_coding: '', rej_online: '', rej_excess: '', rej_total: '', qty_used: '', qty_returned: '', checked_by_pkg: '', checked_by_qa: '' },
        { sr: '3', material: 'Inserts', ar_no: '', qty_issued: '', rej_coding: '', rej_online: '', rej_excess: '', rej_total: '', qty_used: '', qty_returned: '', checked_by_pkg: '', checked_by_qa: '' },
        { sr: '4', material: 'Measuring\nCap', ar_no: '', qty_issued: '', rej_coding: '', rej_online: '', rej_excess: '', rej_total: '', qty_used: '', qty_returned: '', checked_by_pkg: '', checked_by_qa: '' },
      ],
      qa_final_inspection_p14: [
        { unit: 'Outer box', checking: 'Quality and Quantity', no_of_unit: '', checked_by_date: '', checked_by_date_qa: '' },
        { unit: 'Inner box', checking: 'Quality and Quantity', no_of_unit: '', checked_by_date: '', checked_by_date_qa: '' },
        { unit: 'Carton', checking: 'Quality and Quantity', no_of_unit: '', checked_by_date: '', checked_by_date_qa: '' },
      ],
    },

    page15: {
      qa_final_inspection_p15: [
        { unit: 'Bottle', checking: 'Quality and Quantity', no_of_unit: '', checked_by_date: '', checked_by_date_qa: '' }
      ],
      fp_transfer_slip_no: '',
      fp_transfer_time_date: '',
      yield_a_nos: '',
      yield_a_ltr: '',
      yield_b_nos: '',
      yield_b_ltr: '',
      yield_c_nos: '',
      yield_c_ltr: '',
      yield_d_nos: '',
      yield_d_ltr: '',
      final_yield_calc: '',
      final_yield_val: '',
      accountability_calc: '',
      accountability_val: '',
    },

    page16: {
      specimen_image: '',
      specimen_notes: '',
    },

    page17: {},

    page18: {
      yield_deviation_lines: ['', '', '', ''],
      yield_dev_prod_sign: '',
      yield_dev_qa_sign: '',
      procedural_deviations_p18: [
        { sr: '', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '', details: '', action: '', raise_by: '', approved_qa: '' },
      ],
    },

    page19: {
      procedural_deviations_p19: [
        { sr: '', details: '', action: '', raise_by: '', approved_qa: '' },
        { sr: '', details: '', action: '', raise_by: '', approved_qa: '' },
      ],
      proc_dev_prod_sign: '',
      proc_dev_qa_sign: '',
    },
  }
}

export function normalizeOilBmrData(raw, orderParam) {
  const base = getEmptyOilBmrData(orderParam)
  if (!raw || typeof raw !== 'object') return base

  const merged = { ...base }

  // Header merging
  if (raw.header && typeof raw.header === 'object') {
    merged.header = {
      ...base.header,
      ...raw.header,
      product: raw.header.product || base.header.product,
      product_code: raw.header.product_code || base.header.product_code,
      batch_no: raw.header.batch_no || base.header.batch_no,
      mfg_for: raw.header.mfg_for || base.header.mfg_for,
      company_code: raw.header.company_code || base.header.company_code,
    }
  }

  // Footers merging
  if (Array.isArray(raw.footers)) {
    merged.footers = base.footers.map((bf, idx) => ({
      ...bf,
      ...(raw.footers[idx] || {}),
    }))
  }

  // Page-by-page merging (pages 1 to 19)
  for (let i = 1; i <= 19; i++) {
    const pageKey = `page${i}`
    if (raw[pageKey] && typeof raw[pageKey] === 'object') {
      merged[pageKey] = {
        ...base[pageKey],
        ...raw[pageKey],
      }

      // Deep merges for nested structures
      if (i === 1 && raw.page1?.attachments) {
        merged.page1.attachments = {
          ...base.page1.attachments,
          ...raw.page1.attachments,
        }
      }

      if (i === 2 && raw.page2?.line_clearance_p2) {
        merged.page2.line_clearance_p2 = {
          ...base.page2.line_clearance_p2,
          ...raw.page2.line_clearance_p2,
        }
      }

      if (i === 3) {
        if (raw.page3?.line_clearance_p3) {
          merged.page3.line_clearance_p3 = {
            ...base.page3.line_clearance_p3,
            ...raw.page3.line_clearance_p3,
          }
        }
        if (raw.page3?.mfg_area_clearance_p3) {
          merged.page3.mfg_area_clearance_p3 = {
            ...base.page3.mfg_area_clearance_p3,
            ...raw.page3.mfg_area_clearance_p3,
          }
        }
      }

      if (i === 4) {
        if (raw.page4?.mfg_area_clearance_p4) {
          merged.page4.mfg_area_clearance_p4 = {
            ...base.page4.mfg_area_clearance_p4,
            ...raw.page4.mfg_area_clearance_p4,
          }
        }
        if (Array.isArray(raw.page4?.oil_mfg_equipments)) {
          merged.page4.oil_mfg_equipments = base.page4.oil_mfg_equipments.map((be, idx) => ({
            ...be,
            ...(raw.page4.oil_mfg_equipments[idx] || {}),
          }))
        }
      }

      if (i === 5 && Array.isArray(raw.page5?.bulk_processes)) {
        merged.page5.bulk_processes = base.page5.bulk_processes.map((bp, idx) => ({
          ...bp,
          ...(raw.page5.bulk_processes[idx] || {}),
        }))
      }

      if (i === 6 && raw.page6?.filling_area_clearance) {
        merged.page6.filling_area_clearance = {
          ...base.page6.filling_area_clearance,
          ...raw.page6.filling_area_clearance,
        }
      }

      if (i === 7) {
        if (Array.isArray(raw.page7?.filling_equipments)) {
          merged.page7.filling_equipments = base.page7.filling_equipments.map((fe, idx) => ({
            ...fe,
            ...(raw.page7.filling_equipments[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page7?.volume_setting)) {
          merged.page7.volume_setting = base.page7.volume_setting.map((vs, idx) => ({
            ...vs,
            ...(raw.page7.volume_setting[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page7?.filling_records_p7)) {
          merged.page7.filling_records_p7 = base.page7.filling_records_p7.map((fr, idx) => ({
            ...fr,
            ...(raw.page7.filling_records_p7[idx] || {}),
          }))
        }
      }

      if (i === 8) {
        if (Array.isArray(raw.page8?.filling_records_p8)) {
          merged.page8.filling_records_p8 = base.page8.filling_records_p8.map((fr, idx) => ({
            ...fr,
            ...(raw.page8.filling_records_p8[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page8?.capping_sealing)) {
          merged.page8.capping_sealing = base.page8.capping_sealing.map((cs, idx) => ({
            ...cs,
            ...(raw.page8.capping_sealing[idx] || {}),
          }))
        }
      }

      if (i === 9) {
        if (Array.isArray(raw.page9?.visual_inspection_table1)) {
          merged.page9.visual_inspection_table1 = base.page9.visual_inspection_table1.map((vi, idx) => ({
            ...vi,
            ...(raw.page9.visual_inspection_table1[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page9?.visual_inspection_table2)) {
          merged.page9.visual_inspection_table2 = base.page9.visual_inspection_table2.map((vi, idx) => ({
            ...vi,
            ...(raw.page9.visual_inspection_table2[idx] || {}),
          }))
        }
        if (raw.page9?.pm_disp_clearance) {
          merged.page9.pm_disp_clearance = {
            ...base.page9.pm_disp_clearance,
            ...raw.page9.pm_disp_clearance,
          }
        }
      }

      if (i === 10) {
        if (Array.isArray(raw.page10?.environmental_control)) {
          merged.page10.environmental_control = base.page10.environmental_control.map((ec, idx) => ({
            ...ec,
            ...(raw.page10.environmental_control[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page10?.equipment_clearance)) {
          merged.page10.equipment_clearance = base.page10.equipment_clearance.map((ec, idx) => ({
            ...ec,
            ...(raw.page10.equipment_clearance[idx] || {}),
          }))
        }
      }

      if (i === 11) {
        if (Array.isArray(raw.page11?.stereo_details)) {
          merged.page11.stereo_details = base.page11.stereo_details.map((sd, idx) => ({
            ...sd,
            ...(raw.page11.stereo_details[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page11?.coding_records)) {
          merged.page11.coding_records = base.page11.coding_records.map((cr, idx) => ({
            ...cr,
            ...(raw.page11.coding_records[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page11?.coding_time_records_p11)) {
          merged.page11.coding_time_records_p11 = base.page11.coding_time_records_p11.map((ctr, idx) => ({
            ...ctr,
            ...(raw.page11.coding_time_records_p11[idx] || {}),
          }))
        }
      }

      if (i === 12) {
        if (Array.isArray(raw.page12?.coding_time_records_p12)) {
          merged.page12.coding_time_records_p12 = base.page12.coding_time_records_p12.map((ctr, idx) => ({
            ...ctr,
            ...(raw.page12.coding_time_records_p12[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page12?.pkg_area_clearance)) {
          merged.page12.pkg_area_clearance = base.page12.pkg_area_clearance.map((pac, idx) => ({
            ...pac,
            ...(raw.page12.pkg_area_clearance[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page12?.sticker_pasting_time)) {
          merged.page12.sticker_pasting_time = base.page12.sticker_pasting_time.map((spt, idx) => ({
            ...spt,
            ...(raw.page12.sticker_pasting_time[idx] || {}),
          }))
        }
      }

      if (i === 13) {
        if (Array.isArray(raw.page13?.cartoning_time)) {
          merged.page13.cartoning_time = base.page13.cartoning_time.map((ct, idx) => ({
            ...ct,
            ...(raw.page13.cartoning_time[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page13?.outer_packing_time)) {
          merged.page13.outer_packing_time = base.page13.outer_packing_time.map((opt, idx) => ({
            ...opt,
            ...(raw.page13.outer_packing_time[idx] || {}),
          }))
        }
        if (raw.page13?.bonded_slip) {
          merged.page13.bonded_slip = {
            ...base.page13.bonded_slip,
            ...raw.page13.bonded_slip,
          }
        }
      }

      if (i === 14) {
        if (Array.isArray(raw.page14?.pm_reconciliation)) {
          merged.page14.pm_reconciliation = base.page14.pm_reconciliation.map((pmr, idx) => ({
            ...pmr,
            ...(raw.page14.pm_reconciliation[idx] || {}),
          }))
        }
        if (Array.isArray(raw.page14?.qa_final_inspection_p14)) {
          merged.page14.qa_final_inspection_p14 = base.page14.qa_final_inspection_p14.map((qaf, idx) => ({
            ...qaf,
            ...(raw.page14.qa_final_inspection_p14[idx] || {}),
          }))
        }
      }

      if (i === 15) {
        if (Array.isArray(raw.page15?.qa_final_inspection_p15)) {
          merged.page15.qa_final_inspection_p15 = base.page15.qa_final_inspection_p15.map((qaf, idx) => ({
            ...qaf,
            ...(raw.page15.qa_final_inspection_p15[idx] || {}),
          }))
        }
      }

      if (i === 18) {
        if (Array.isArray(raw.page18?.yield_deviation_lines)) {
          merged.page18.yield_deviation_lines = [
            raw.page18.yield_deviation_lines[0] || '',
            raw.page18.yield_deviation_lines[1] || '',
            raw.page18.yield_deviation_lines[2] || '',
            raw.page18.yield_deviation_lines[3] || '',
          ]
        }
        if (Array.isArray(raw.page18?.procedural_deviations_p18)) {
          merged.page18.procedural_deviations_p18 = base.page18.procedural_deviations_p18.map((pd, idx) => ({
            ...pd,
            ...(raw.page18.procedural_deviations_p18[idx] || {}),
          }))
        }
      }

      if (i === 19) {
        if (Array.isArray(raw.page19?.procedural_deviations_p19)) {
          merged.page19.procedural_deviations_p19 = base.page19.procedural_deviations_p19.map((pd, idx) => ({
            ...pd,
            ...(raw.page19.procedural_deviations_p19[idx] || {}),
          }))
        }
      }
    }
  }

  return merged
}
