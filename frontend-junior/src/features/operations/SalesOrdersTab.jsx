import { confirmAction } from '../../components/ConfirmProvider'
import { useEffect, useMemo, useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { LoadingState } from '../../components/Spinner'
import Modal from '../inventory/components/Modal'

import useAuth from '../../hooks/useAuth'

import { getErrorMessage } from '../../utils/errors'

import {
  operationsService,
} from './operationsService'

import {
  ORDER_FIELDS,
  canCreateOrders,
  canDeleteOrders,
  canEditOrderField,
  getEditableOrderFields,
  getOrderRole,
} from './orderPermissions'

import './SalesOrders.css'


const listData = (response) =>
  Array.isArray(response.data)
    ? response.data
    : response.data?.results || []


const EMPTY_FORM = {
  number: '',

  product_name: '',
  product_type: '',
  product_code: '',

  company: '',
  company_code: '',
  customer: '',

  order_date:
    new Date()
      .toISOString()
      .slice(0, 10),

  planned_mfg_date: '',

  status: 'CONFIRMED',

  // Manager
  batch_no: '',
  packing_size: '',
  batch_size: '',
  mrp_for_printing: '',
  printing_status: 'PENDING',

  // Store Manager
  packing_type: '',
  label: '',
  box: '',
  insert: '',
  requisition_status: 'PENDING',
}


const SELECT_OPTIONS = {
  printing_status: [
    'PENDING',
    'PRINTED',
    'HOLD',
  ],

  requisition_status: [
    'PENDING',
    'REQUESTED',
    'APPROVED',
    'COMPLETED',
    'REJECTED',
  ],

  status: [
    'DRAFT',
    'CONFIRMED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
  ],

  product_type: [
    'Liquid',
    'Tablet',
    'Capsule',
    'Syrup',
    'Drops',
    'Oil',
    'Kit',
    'Pills',
  ],
}


function makeForm(order = {}) {
  return Object.keys(
    EMPTY_FORM
  ).reduce(
    (form, field) => {
      form[field] =
        order[field] ??
        EMPTY_FORM[field]

      return form
    },
    {}
  )
}


export default function SalesOrdersTab({
  companies = [],
  customers = [],
  onOrdersChanged,
}) {

  const { user } = useAuth()

  const role =
    getOrderRole(user)


  const editableFields =
    useMemo(
      () =>
        new Set(
          getEditableOrderFields(
            user
          )
        ),
      [user]
    )


  const [
    orders,
    setOrders,
  ] = useState([])


  const [
    loading,
    setLoading,
  ] = useState(true)


  const [
    error,
    setError,
  ] = useState('')


  const [
    success,
    setSuccess,
  ] = useState('')


  const [
    modal,
    setModal,
  ] = useState(null)


  const [
    form,
    setForm,
  ] = useState(
    EMPTY_FORM
  )


  const [
    saving,
    setSaving,
  ] = useState(false)


  const [
    deletingId,
    setDeletingId,
  ] = useState(null)


  /*
   * =========================================================
   * SEARCHABLE CUSTOMER
   * =========================================================
   */

  const [
    customerSearch,
    setCustomerSearch,
  ] = useState('')


  const [
    customerDropdownOpen,
    setCustomerDropdownOpen,
  ] = useState(false)


  const filteredCustomers =
    useMemo(
      () => {

        const search =
          customerSearch
            .trim()
            .toLowerCase()


        if (!search) {
          return customers
        }


        return customers.filter(
          (customer) => {

            const name =
              String(
                customer.name || ''
              ).toLowerCase()


            const code =
              String(
                customer.code || ''
              ).toLowerCase()


            const phone =
              String(
                customer.phone || ''
              ).toLowerCase()


            const email =
              String(
                customer.email || ''
              ).toLowerCase()


            return (
              name.includes(search) ||
              code.includes(search) ||
              phone.includes(search) ||
              email.includes(search)
            )
          }
        )
      },
      [
        customers,
        customerSearch,
      ]
    )


  const selectedCustomer =
    customers.find(
      (customer) =>
        String(customer.id) ===
        String(form.customer)
    )


  /*
   * =========================================================
   * ORDERS LOAD
   * =========================================================
   */

  const load = async () => {

    setLoading(true)

    setError('')

    try {

      const response =
        await operationsService
          .getOrders()

      setOrders(
        listData(response)
      )

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    } finally {

      setLoading(false)

    }
  }


  useEffect(() => {
    load()
  }, [])


  /*
   * =========================================================
   * CREATE ORDER
   * =========================================================
   */

  const openCreate = () => {

    setError('')
    setSuccess('')

    setForm({
      ...EMPTY_FORM,

      order_date:
        new Date()
          .toISOString()
          .slice(0, 10),
    })

    setCustomerSearch('')

    setCustomerDropdownOpen(false)

    setModal({
      type: 'create',
      order: null,
    })
  }


  /*
   * =========================================================
   * EDIT ORDER
   * =========================================================
   */

  const openEdit = (order) => {

    setError('')
    setSuccess('')

    setForm(
      makeForm(order)
    )


    const existingCustomer =
      customers.find(
        (customer) =>
          String(customer.id) ===
          String(order.customer)
      )


    setCustomerSearch(
      existingCustomer?.name || ''
    )

    setCustomerDropdownOpen(false)


    setModal({
      type: 'edit',
      order,
    })
  }


  /*
   * =========================================================
   * CLOSE MODAL
   * =========================================================
   */

  const close = () => {

    if (!saving) {

      setModal(null)

      setCustomerSearch('')

      setCustomerDropdownOpen(false)
    }
  }


  /*
   * =========================================================
   * FORM FIELD
   * =========================================================
   */

  const setField = (
    field,
    value
  ) => {

    setForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    )
  }


  /*
   * =========================================================
   * COMPANY CHANGE
   * =========================================================
   */

  const handleCompanyChange = (
    value
  ) => {

    const company =
      companies.find(
        (item) =>
          String(item.id) ===
          String(value)
      )


    setForm(
      (current) => ({
        ...current,

        company: value,

        company_code:
          company?.code || '',
      })
    )
  }


  /*
   * =========================================================
   * CUSTOMER SELECT
   * =========================================================
   */

  const handleCustomerSelect = (
    customer
  ) => {

    setField(
      'customer',
      customer.id
    )


    setCustomerSearch(
      customer.name || ''
    )


    setCustomerDropdownOpen(
      false
    )
  }


  /*
   * =========================================================
   * SAVE
   * =========================================================
   */

  const save = async (
    event
  ) => {

    event?.preventDefault()


    if (!modal) {
      return
    }


    setSaving(true)

    setError('')


    try {

      if (
        modal.type === 'create'
      ) {

        await operationsService
          .createOrder({
            ...form,
            lines: [],
          })


        setSuccess(
          'Sales order created successfully.'
        )

      } else {

        const payload =
          Object.fromEntries(
            Object.entries(form)
              .filter(
                ([field]) =>
                  editableFields
                    .has(field)
              )
          )


        await operationsService
          .updateOrder(
            modal.order.id,
            payload
          )


        setSuccess(
          'Sales order updated successfully.'
        )
      }


      setModal(null)

      setCustomerSearch('')

      setCustomerDropdownOpen(false)

      await load()

      await onOrdersChanged?.()

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    } finally {

      setSaving(false)

    }
  }


  /*
   * =========================================================
   * DELETE
   * =========================================================
   */

  const remove = async (
    order
  ) => {

    if (
      !(await confirmAction(
        `Delete sales order ${
          order.number ||
          order.id
        }?`
      ))
    ) {
      return
    }


    setDeletingId(order.id)

    setError('')
    setSuccess('')


    try {

      await operationsService
        .deleteOrder(order.id)


      setSuccess(
        'Sales order deleted successfully.'
      )


      await load()

      await onOrdersChanged?.()

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    } finally {

      setDeletingId(null)

    }
  }


  const canEdit =
    editableFields.size > 0


  return (

    <div className="inv-panel sales-orders-panel">


      {/* ==================================================
          HEADER
          ================================================== */}

      <div className="inv-toolbar">

        <div>

          <h3>
            Sales Orders
          </h3>


          <p className="sales-orders-helper">

            {role === 'ADMIN' &&
              'Admin: full create, edit and delete access.'}

            {role === 'MANAGER' &&
              'Manager: edit Batch No., Packing Size, Batch Size, MRP for Printing and Printing Status only.'}

            {role === 'STORES_MANAGER' &&
              'Store Manager: edit Packing Type, Label, Box, Insert and Requisition Status only.'}

            {role === 'VIEWER' &&
              'You have view-only access to sales orders.'}

          </p>

        </div>


        {canCreateOrders(user) && (

          <Button
            onClick={openCreate}
          >
            + Add order
          </Button>

        )}

      </div>


      {/* ==================================================
          ALERTS
          ================================================== */}

      {error && !modal && (

        <Alert type="error">
          {error}
        </Alert>

      )}


      {success && (

        <Alert type="success">
          {success}
        </Alert>

      )}


      {/* ==================================================
          ACCESS
          ================================================== */}

      <div className="sales-orders-access">

        <span className="sales-orders-role">
          {role.replace('_', ' ')}
        </span>

        <span>
          {editableFields.size}
          {' '}
          editable fields
        </span>

      </div>


      {/* ==================================================
          ORDERS TABLE
          ================================================== */}

      <div className="inv-table-scroll">

        <table className="inv-table sales-orders-table">

          <thead>

            <tr>

              <th>Order No.</th>

              <th>Product Name</th>

              <th>Type</th>

              <th>Company</th>

              <th>Company Code</th>

              <th>Date of Order</th>

              <th>Planned Mfg Date</th>

              <th>Product Code</th>

              <th>Batch No.</th>

              <th>Packing Size</th>

              <th>Batch Size</th>

              <th>MRP</th>

              <th>Printing</th>

              <th>Packing Type</th>

              <th>Label</th>

              <th>Box</th>

              <th>Insert</th>

              <th>Requisition</th>

              <th>Action</th>

            </tr>

          </thead>


          <tbody>

            {orders.map(
              (order) => (

                <tr
                  key={order.id}
                >

                  <td className="cell-strong">
                    {order.number || '—'}
                  </td>


                  <td>
                    {order.product_name || '—'}
                  </td>


                  <td>
                    {order.product_type || '—'}
                  </td>


                  <td>
                    {order.company_name || '—'}
                  </td>


                  <td>
                    {order.company_code || '—'}
                  </td>


                  <td>
                    {order.order_date || '—'}
                  </td>


                  <td>
                    {order.planned_mfg_date || '—'}
                  </td>


                  <td>
                    {order.product_code || '—'}
                  </td>


                  <td>
                    {order.batch_no || '—'}
                  </td>


                  <td>
                    {order.packing_size || '—'}
                  </td>


                  <td>
                    {order.batch_size || '—'}
                  </td>


                  <td>
                    {order.mrp_for_printing || '—'}
                  </td>


                  <td>
                    {order.printing_status || '—'}
                  </td>


                  <td>
                    {order.packing_type || '—'}
                  </td>


                  <td>
                    {order.label || '—'}
                  </td>


                  <td>
                    {order.box || '—'}
                  </td>


                  <td>
                    {order.insert || '—'}
                  </td>


                  <td>
                    {order.requisition_status || '—'}
                  </td>


                  <td>

                    <div className="sales-order-actions">

                      {canEdit && (

                        <Button
                          variant="secondary"
                          onClick={() =>
                            openEdit(order)
                          }
                        >
                          Edit
                        </Button>

                      )}


                      {canDeleteOrders(user) && (

                        <Button
                          variant="danger"
                          loading={
                            deletingId ===
                            order.id
                          }
                          onClick={() =>
                            remove(order)
                          }
                        >
                          Delete
                        </Button>

                      )}

                    </div>

                  </td>

                </tr>

              )
            )}

          </tbody>

        </table>


        {!loading &&
          orders.length === 0 && (

            <p className="inv-empty">
              No sales orders found for
              the active company.
            </p>

          )}


        {loading && (

          <LoadingState label="Loading sales orders..." compact />

        )}

      </div>


      {/* ==================================================
          CREATE / EDIT MODAL
          ================================================== */}

      {modal && (

        <Modal
          title={
            modal.type === 'create'
              ? 'Create Sales Order'
              : 'Edit Sales Order'
          }
          onClose={close}
          footer={

            <>

              <Button
                variant="secondary"
                onClick={close}
              >
                Cancel
              </Button>


              <Button
                loading={saving}
                onClick={save}
              >
                {modal.type === 'create'
                  ? 'Save order'
                  : 'Save changes'}
              </Button>

            </>

          }
        >


          {error && (

            <Alert type="error">
              {error}
            </Alert>

          )}


          <form onSubmit={save}>


            {/* ==================================================
                SALES ORDER DETAILS
                ================================================== */}

            <div className="sales-order-form-section">

              <h4>
                Sales Order Details
              </h4>


              <div className="inv-form-grid">


                <OrderField
                  field="number"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'number'
                    )
                  }
                  required
                />


                <OrderField
                  field="product_name"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'product_name'
                    )
                  }
                  required
                />


                <OrderSelect
                  field="product_type"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'product_type'
                    )
                  }
                />


                <OrderField
                  field="product_code"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'product_code'
                    )
                  }
                />


                {/* COMPANY */}

                <div className="field">

                  <label className="field-label">
                    Company
                  </label>


                  <select
                    className="field-input"
                    value={form.company}
                    onChange={(event) =>
                      handleCompanyChange(
                        event.target.value
                      )
                    }
                    disabled={
                      modal.type !== 'create' &&
                      !canEditOrderField(
                        user,
                        'company'
                      )
                    }
                    required
                  >

                    <option value="">
                      Select company
                    </option>


                    {companies.map(
                      (company) => (

                        <option
                          key={company.id}
                          value={company.id}
                        >
                          {company.name}
                        </option>

                      )
                    )}

                  </select>

                </div>


                <OrderField
                  field="company_code"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'company_code'
                    )
                  }
                />


                {/* ==================================================
                    SEARCHABLE CUSTOMER
                    ================================================== */}

                <div className="field customer-search-field">

                  <label className="field-label">
                    Customer
                  </label>


                  <div className="customer-search-select">


                    {/* SEARCH INPUT */}

                    <div
                      className={
                        `customer-search-input-wrap ${
                          customerDropdownOpen
                            ? 'is-open'
                            : ''
                        }`
                      }
                    >

                      <span className="customer-search-icon">
                        🔍
                      </span>


                      <input
                        type="text"
                        className="customer-search-input"
                        value={
                          customerSearch
                        }
                        placeholder="Search customer..."
                        autoComplete="off"
                        disabled={
                          modal.type !== 'create' &&
                          !canEditOrderField(
                            user,
                            'customer'
                          )
                        }
                        onFocus={(event) => {

                          setCustomerDropdownOpen(
                            true
                          )

                          event.currentTarget.select()

                        }}
                        onChange={(event) => {

                          const value =
                            event.target.value

                          setCustomerSearch(
                            value
                          )

                          setCustomerDropdownOpen(
                            true
                          )


                          /*
                           * If the user changes the
                           * selected name manually,
                           * remove the old customer ID.
                           */
                          if (
                            form.customer &&
                            value !==
                              (
                                selectedCustomer?.name ||
                                ''
                              )
                          ) {

                            setField(
                              'customer',
                              ''
                            )
                          }

                        }}
                        onKeyDown={(event) => {

                          if (
                            event.key ===
                            'Escape'
                          ) {

                            setCustomerDropdownOpen(
                              false
                            )

                          }

                        }}
                      />


                      {customerSearch && (

                        <button
                          type="button"
                          className="customer-search-clear"
                          aria-label="Clear customer"
                          onMouseDown={(event) =>
                            event.preventDefault()
                          }
                          onClick={() => {

                            setCustomerSearch(
                              ''
                            )

                            setField(
                              'customer',
                              ''
                            )

                            setCustomerDropdownOpen(
                              true
                            )

                          }}
                        >
                          ×
                        </button>

                      )}


                      <span className="customer-search-arrow">
                        {customerDropdownOpen
                          ? '▲'
                          : '▼'}
                      </span>

                    </div>


                    {/* ==================================================
                        CUSTOMER RESULTS
                        ================================================== */}

                    {customerDropdownOpen && (

                      <div className="customer-search-dropdown">


                        <div className="customer-search-count">

                          {filteredCustomers.length}

                          {' '}

                          customer
                          {filteredCustomers.length ===
                          1
                            ? ''
                            : 's'}

                          {' '}
                          found

                        </div>


                        <div className="customer-search-options">


                          {filteredCustomers.length >
                          0 ? (

                            filteredCustomers.map(
                              (customer) => (

                                <button
                                  type="button"
                                  key={customer.id}
                                  className={
                                    `customer-search-option ${
                                      String(
                                        form.customer
                                      ) ===
                                      String(
                                        customer.id
                                      )
                                        ? 'selected'
                                        : ''
                                    }`
                                  }
                                  onMouseDown={(event) =>
                                    event.preventDefault()
                                  }
                                  onClick={() =>
                                    handleCustomerSelect(
                                      customer
                                    )
                                  }
                                >

                                  <span className="customer-option-text">

                                    <strong>
                                      {customer.name}
                                    </strong>


                                    {(customer.code ||
                                      customer.phone ||
                                      customer.email) && (

                                      <small>

                                        {customer.code &&
                                          customer.code}


                                        {customer.code &&
                                          (
                                            customer.phone ||
                                            customer.email
                                          ) &&
                                          ' • '}


                                        {customer.phone &&
                                          customer.phone}


                                        {customer.phone &&
                                          customer.email &&
                                          ' • '}


                                        {customer.email &&
                                          customer.email}

                                      </small>

                                    )}

                                  </span>


                                  {String(
                                    form.customer
                                  ) ===
                                    String(
                                      customer.id
                                    ) && (

                                    <span className="customer-option-check">
                                      ✓
                                    </span>

                                  )}

                                </button>

                              )
                            )

                          ) : (

                            <div className="customer-search-empty">

                              No customers found

                            </div>

                          )}

                        </div>

                      </div>

                    )}

                  </div>

                </div>


                <OrderField
                  field="order_date"
                  form={form}
                  setField={setField}
                  type="date"
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'order_date'
                    )
                  }
                  required
                />


                <OrderField
                  field="planned_mfg_date"
                  form={form}
                  setField={setField}
                  type="date"
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'planned_mfg_date'
                    )
                  }
                />

              </div>

            </div>


            {/* ==================================================
                MANAGER ACCESS
                ================================================== */}

            <div className="sales-order-form-section">

              <h4>
                Manager Access Fields
              </h4>


              <div className="inv-form-grid">


                <OrderField
                  field="batch_no"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'batch_no'
                    )
                  }
                />


                <OrderField
                  field="packing_size"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'packing_size'
                    )
                  }
                />


                <OrderField
                  field="batch_size"
                  form={form}
                  setField={setField}
                  type="number"
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'batch_size'
                    )
                  }
                />


                <OrderField
                  field="mrp_for_printing"
                  form={form}
                  setField={setField}
                  type="number"
                  step="0.01"
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'mrp_for_printing'
                    )
                  }
                />


                <OrderSelect
                  field="printing_status"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'printing_status'
                    )
                  }
                />

              </div>

            </div>


            {/* ==================================================
                STORE MANAGER ACCESS
                ================================================== */}

            <div className="sales-order-form-section">

              <h4>
                Store Manager Access Fields
              </h4>


              <div className="inv-form-grid">


                <OrderField
                  field="packing_type"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'packing_type'
                    )
                  }
                />


                <OrderField
                  field="label"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'label'
                    )
                  }
                />


                <OrderField
                  field="box"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'box'
                    )
                  }
                />


                <OrderField
                  field="insert"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'insert'
                    )
                  }
                />


                <OrderSelect
                  field="requisition_status"
                  form={form}
                  setField={setField}
                  editable={
                    modal.type === 'create' ||
                    canEditOrderField(
                      user,
                      'requisition_status'
                    )
                  }
                />

              </div>

            </div>


            {/* ==================================================
                ADMIN
                ================================================== */}

            {role === 'ADMIN' && (

              <div className="sales-order-form-section">

                <h4>
                  Admin Fields
                </h4>


                <div className="inv-form-grid">

                  <OrderSelect
                    field="status"
                    form={form}
                    setField={setField}
                    editable
                  />

                </div>

              </div>

            )}

          </form>

        </Modal>

      )}

    </div>
  )
}


/* =========================================================
   ORDER FIELD
   ========================================================= */

function OrderField({
  field,
  form,
  setField,
  editable,
  type = 'text',
  ...props
}) {

  return (

    <Input
      label={ORDER_FIELDS[field]}
      type={type}
      value={form[field] ?? ''}
      onChange={(event) =>
        setField(
          field,
          event.target.value
        )
      }
      disabled={!editable}
      {...props}
    />

  )
}


/* =========================================================
   ORDER SELECT
   ========================================================= */

function OrderSelect({
  field,
  form,
  setField,
  editable,
}) {

  return (

    <div className="field">

      <label className="field-label">
        {ORDER_FIELDS[field]}
      </label>


      <select
        className="field-input"
        value={
          form[field] ?? ''
        }
        onChange={(event) =>
          setField(
            field,
            event.target.value
          )
        }
        disabled={!editable}
      >

        <option value="">Select {ORDER_FIELDS[field] || 'option'}</option>
        {(
          SELECT_OPTIONS[field] ||
          []
        ).map(
          (option) => (

            <option
              key={option}
              value={option}
            >
              {option}
            </option>

          )
        )}

      </select>

    </div>

  )
}