import { storage } from '../../utils/storage'
import {
  isSuperAdmin,
} from '../../utils/companyScope'


/*
 * ============================================================
 * ORDER PERMISSION SYSTEM
 * ============================================================
 *
 * SUPER ADMIN
 * -----------
 * Full order access.
 *
 * HR MANAGER
 * ----------
 * Can edit:
 * - Batch No.
 * - Packing Size
 * - Batch Size
 * - MRP for Printing
 * - Printing Status
 *
 * STORES MANAGER
 * --------------
 * Can edit:
 * - Packing Type
 * - Label
 * - Box
 * - Insert
 * - Requisition Status
 *
 * OTHER ROLES
 * -----------
 * View-only access.
 *
 */


/*
 * ============================================================
 * SUPER ADMIN ORDER FIELDS
 * ============================================================
 */

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


/*
 * ============================================================
 * HR MANAGER ORDER FIELDS
 * ============================================================
 */

export const HR_MANAGER_ORDER_FIELDS = [

  'batch_no',

  'packing_size',

  'batch_size',

  'mrp_for_printing',

  'printing_status',

]


/*
 * ============================================================
 * STORES MANAGER ORDER FIELDS
 * ============================================================
 */

export const STORE_MANAGER_ORDER_FIELDS = [

  'packing_type',

  'label',

  'box',

  'insert',

  'requisition_status',

]


/*
 * ============================================================
 * ORDER FIELD LABELS
 * ============================================================
 */

export const ORDER_FIELDS = {

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


/*
 * Backward-compatible alias.
 */

export const ORDER_FIELD_LABELS =
  ORDER_FIELDS


/*
 * ============================================================
 * GET USER ROLE
 * ============================================================
 */

export function getOrderRole(
  user = storage.getUser()
) {

  if (
    isSuperAdmin(user)
  ) {

    return 'SUPER_ADMIN'

  }


  return String(

    user?.profile?.role ||

    user?.role ||

    ''

  )

    .trim()

    .toUpperCase()

}


/*
 * ============================================================
 * CAN CREATE ORDER
 * ============================================================
 */

export function canCreateOrders(
  user = storage.getUser()
) {

  return isSuperAdmin(
    user
  )

}


/*
 * ============================================================
 * CURRENT USER ROLE
 * ============================================================
 */

export function getCurrentUserRole(
  user = storage.getUser()
) {

  return getOrderRole(
    user
  )

}


/*
 * ============================================================
 * GET EDITABLE ORDER FIELDS
 * ============================================================
 */

export function getOrderEditFields(
  user = storage.getUser()
) {

  if (
    isSuperAdmin(user)
  ) {

    return [
      ...ADMIN_ORDER_FIELDS,
    ]

  }


  const role =
    getOrderRole(user)


  if (
    role === 'HR_MANAGER'
  ) {

    return [
      ...HR_MANAGER_ORDER_FIELDS,
    ]

  }


  if (
    role === 'STORES_MANAGER'
  ) {

    return [
      ...STORE_MANAGER_ORDER_FIELDS,
    ]

  }


  return []

}


/*
 * ============================================================
 * COMPATIBILITY FUNCTION
 * ============================================================
 *
 * SalesOrdersTab.jsx currently imports:
 *
 * getEditableOrderFields
 *
 * Keep this alias so the existing component
 * continues to work without changing it.
 *
 */

export function getEditableOrderFields(
  user = storage.getUser()
) {

  return getOrderEditFields(
    user
  )

}


/*
 * ============================================================
 * CAN EDIT ANY ORDER FIELD
 * ============================================================
 */

export function canEditOrders(
  user = storage.getUser()
) {

  return (
    getOrderEditFields(
      user
    ).length > 0
  )

}


/*
 * ============================================================
 * CAN DELETE ORDER
 * ============================================================
 */

export function canDeleteOrders(
  user = storage.getUser()
) {

  return isSuperAdmin(
    user
  )

}


/*
 * ============================================================
 * CAN EDIT SPECIFIC ORDER FIELD
 * ============================================================
 *
 * Supports both formats:
 *
 * canEditOrderField(
 *   'batch_no',
 *   user
 * )
 *
 * and:
 *
 * canEditOrderField(
 *   user,
 *   'batch_no'
 * )
 *
 */

export function canEditOrderField(
  fieldOrUser,
  userOrField = storage.getUser()
) {

  let field =
    fieldOrUser

  let user =
    userOrField


  /*
   * Detect reversed argument order.
   */

  if (

    fieldOrUser &&

    typeof fieldOrUser ===
      'object' &&

    typeof userOrField ===
      'string'

  ) {

    user =
      fieldOrUser

    field =
      userOrField

  }


  if (
    !field
  ) {

    return false

  }


  return getOrderEditFields(
    user
  ).includes(
    field
  )

}


/*
 * ============================================================
 * FILTER ORDER UPDATE PAYLOAD
 * ============================================================
 *
 * Only fields allowed for the current role
 * are returned.
 *
 */

export function filterOrderEditPayload(
  payload = {},
  user = storage.getUser()
) {

  if (

    !payload ||

    typeof payload !==
      'object'

  ) {

    return {}

  }


  const allowedFields =
    getOrderEditFields(
      user
    )


  const filtered = {}


  allowedFields.forEach(
    (field) => {

      if (

        Object.prototype
          .hasOwnProperty.call(
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