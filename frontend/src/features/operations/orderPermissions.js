import { storage } from '../../utils/storage'
import { isSuperAdmin } from '../../utils/companyScope'


/*
 * ============================================================
 * ORDER EDIT PERMISSIONS
 * ============================================================
 *
 * ADMIN / SUPER ADMIN
 * -------------------
 * Can edit every order field.
 *
 * HR MANAGER
 * ----------
 * Manager-level fields:
 * - Batch No.
 * - Packing Size
 * - Batch Size
 * - MRP for Printing
 * - Printing Status
 *
 * STORE MANAGER
 * -------------
 * Store-level fields:
 * - Packing Type
 * - Label
 * - Box
 * - Insert
 * - Requisition Status
 *
 * Everyone else
 * -------------
 * View only.
 */


/* ============================================================
   ADMIN FIELDS
   ============================================================ */

export const ADMIN_ORDER_FIELDS = [
  'product_name',
  'product_type',
  'company',
  'company_code',
  'order_date',
  'planned_mfg_date',
  'product_code',

  'batch_no',
  'packing_size',
  'batch_size',
  'mrp_for_printing',
  'printing_status',

  'packing_type',
  'label',
  'box',
  'insert',
  'requisition_status',
]


/* ============================================================
   HR MANAGER / MANAGER FIELDS
   ============================================================ */

export const HR_MANAGER_ORDER_FIELDS = [
  'batch_no',
  'packing_size',
  'batch_size',
  'mrp_for_printing',
  'printing_status',
]


/* ============================================================
   STORE MANAGER FIELDS
   ============================================================ */

export const STORE_MANAGER_ORDER_FIELDS = [
  'packing_type',
  'label',
  'box',
  'insert',
  'requisition_status',
]


/* ============================================================
   FIELD LABELS
   ============================================================ */

export const ORDER_FIELD_LABELS = {

  product_name:
    'Product Name',

  product_type:
    'Type',

  company:
    'Company',

  company_code:
    'Company Code',

  order_date:
    'Date of Order',

  planned_mfg_date:
    'Planned Mfg Date',

  product_code:
    'Product Code',

  batch_no:
    'Batch No.',

  packing_size:
    'Packing Size',

  batch_size:
    'Batch Size',

  mrp_for_printing:
    'MRP for Printing',

  printing_status:
    'Printing Status',

  packing_type:
    'Packing Type',

  label:
    'Label',

  box:
    'Box',

  insert:
    'Insert',

  requisition_status:
    'Requisition Status',

}


/* ============================================================
   ROLE
   ============================================================ */

export function getCurrentUserRole() {

  const user =
    storage.getUser()

  if (
    isSuperAdmin(user)
  ) {
    return 'SUPER_ADMIN'
  }

  return String(
    user?.profile?.role || ''
  )
    .trim()
    .toUpperCase()

}


/* ============================================================
   GET ALLOWED FIELDS
   ============================================================ */

export function getOrderEditFields(
  user = storage.getUser()
) {

  if (
    isSuperAdmin(user)
  ) {
    return ADMIN_ORDER_FIELDS
  }


  const role =
    String(
      user?.profile?.role || ''
    )
      .trim()
      .toUpperCase()


  if (
    role === 'HR_MANAGER'
  ) {
    return HR_MANAGER_ORDER_FIELDS
  }


  if (
    role === 'STORES_MANAGER'
  ) {
    return STORE_MANAGER_ORDER_FIELDS
  }


  return []

}


/* ============================================================
   CAN EDIT ORDER
   ============================================================ */

export function canEditOrders(
  user = storage.getUser()
) {

  return (
    getOrderEditFields(
      user
    ).length > 0
  )

}


/* ============================================================
   CAN DELETE ORDER
   ============================================================ */

export function canDeleteOrders(
  user = storage.getUser()
) {

  return isSuperAdmin(
    user
  )

}


/* ============================================================
   CAN EDIT SPECIFIC FIELD
   ============================================================ */

export function canEditOrderField(
  field,
  user = storage.getUser()
) {

  return getOrderEditFields(
    user
  ).includes(field)

}


/* ============================================================
   FILTER PAYLOAD
   ============================================================
 *
 * This is the important security layer.
 *
 * Even if HR Manager manually sends:
 *
 * {
 *   product_name: 'ABC',
 *   batch_no: 'B-100'
 * }
 *
 * only batch_no will survive.
 *
 */

export function filterOrderEditPayload(
  payload = {},
  user = storage.getUser()
) {

  const allowedFields =
    getOrderEditFields(
      user
    )


  const filtered = {}


  allowedFields.forEach(
    (field) => {

      if (
        Object.prototype.hasOwnProperty.call(
          payload,
          field
        )
      ) {

        filtered[field] =
          payload[field]

      }

    }
  )


  return filtered

}