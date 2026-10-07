import { Link } from 'react-router-dom'
import { confirmAction } from '../../components/ConfirmProvider'
import {
  useEffect,
  useRef,
  useState,
} from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Modal from '../inventory/components/Modal'

import { getErrorMessage } from '../../utils/errors'

import { inventoryService } from '../inventory/inventoryService'
import { operationsService } from './operationsService'

import { storage } from '../../utils/storage'
import { isSuperAdmin } from '../../utils/companyScope'
import SalesOrdersPanel from './SalesOrdersPanel'
import CustomersPanel from './CustomersPanel'
import ProductsPanel from './ProductsPanel'
import './Orders.css'


const TABS = [
  {
    key: 'quotations',
    label: 'Quotations',
  },
  // {
  //   key: 'orders',
  //   label: 'Orders',
  // },
  {
    key: 'batches',
    label: 'Production batches',
  },
]


const listData = (response) =>
  Array.isArray(response.data)
    ? response.data
    : response.data?.results || []


const PRODUCT_TYPE_OPTIONS = [
  'Liquid',
  'Tablet',
  'Capsule',
  'Syrup',
  'Drops',
  'Oil',
  'Kit',
  'Pills',
]


/*
|--------------------------------------------------------------------------
| ORDER PERMISSIONS
|--------------------------------------------------------------------------
*/


const HR_MANAGER_ORDER_FIELDS = [
  'batch_no',
  'packing_size',
  'batch_size',
  'mrp_for_printing',
  'printing_status',
]


const STORE_MANAGER_ORDER_FIELDS = [
  'packing_type',
  'label',
  'box',
  'insert',
  'requisition_status',
]


const ADMIN_ORDER_FIELDS = [
  'product_name',
  'product_type',
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


const ORDER_FIELD_LABELS = {
  product_name:
    'Product Name',

  product_type:
    'Type',

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


function getCurrentUser() {
  return storage.getUser()
}


function getOrderEditFields(
  user = getCurrentUser()
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


function canEditOrders(
  user = getCurrentUser()
) {

  return (
    getOrderEditFields(
      user
    ).length > 0
  )

}


/*
|--------------------------------------------------------------------------
| SEARCHABLE CUSTOMER SELECT
|--------------------------------------------------------------------------
|
| ONLY used for selecting a customer inside the Add Order form.
| It does not create/update/delete customers.
| It does not change the customer API.
| It does not change product management.
|
|--------------------------------------------------------------------------
*/


function SearchableCustomerSelect({
  customers,
  value,
  onChange,
}) {

  const wrapperRef =
    useRef(null)

  const inputRef =
    useRef(null)

  const [
    isOpen,
    setIsOpen,
  ] = useState(false)

  const [
    search,
    setSearch,
  ] = useState('')

  const [
    highlightedIndex,
    setHighlightedIndex,
  ] = useState(0)


  const selectedCustomer =
    customers.find(
      (customer) =>
        String(
          customer.id
        ) ===
        String(value)
    )


  /*
  |--------------------------------------------------------------------------
  | CLOSE WHEN CLICKING OUTSIDE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {

    const handleOutsideClick = (
      event
    ) => {

      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(
          event.target
        )
      ) {

        setIsOpen(false)
        setSearch('')

      }

    }


    document.addEventListener(
      'mousedown',
      handleOutsideClick
    )


    return () => {

      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      )

    }

  }, [])


  /*
  |--------------------------------------------------------------------------
  | FILTER CUSTOMERS
  |--------------------------------------------------------------------------
  */

  const normalizedSearch =
    search
      .trim()
      .toLowerCase()


  const filteredCustomers =
    customers.filter(
      (customer) => {

        if (!normalizedSearch) {
          return true
        }


        const name =
          String(
            customer.name || ''
          )
            .toLowerCase()

        const code =
          String(
            customer.code || ''
          )
            .toLowerCase()

        const email =
          String(
            customer.email || ''
          )
            .toLowerCase()

        const phone =
          String(
            customer.phone || ''
          )
            .toLowerCase()


        return (
          name.includes(
            normalizedSearch
          ) ||
          code.includes(
            normalizedSearch
          ) ||
          email.includes(
            normalizedSearch
          ) ||
          phone.includes(
            normalizedSearch
          )
        )

      }
    )


  /*
  |--------------------------------------------------------------------------
  | LIMIT INITIAL DROPDOWN
  |--------------------------------------------------------------------------
  |
  | With 1000+ customers we don't render all 1000 at once.
  | When searching, matching results are shown.
  |
  */

  const visibleCustomers =
    filteredCustomers.slice(
      0,
      50
    )


  /*
  |--------------------------------------------------------------------------
  | OPEN SEARCH
  |--------------------------------------------------------------------------
  */

  const openSearch = () => {

    setIsOpen(true)

    setSearch('')

    setHighlightedIndex(0)

  }


  /*
  |--------------------------------------------------------------------------
  | SELECT CUSTOMER
  |--------------------------------------------------------------------------
  */

  const selectCustomer = (
    customer
  ) => {

    onChange(
      String(
        customer.id
      )
    )

    setSearch('')

    setIsOpen(false)

    setHighlightedIndex(0)

  }


  /*
  |--------------------------------------------------------------------------
  | CLEAR CUSTOMER
  |--------------------------------------------------------------------------
  */

  const clearCustomer = (
    event
  ) => {

    event.stopPropagation()

    onChange('')

    setSearch('')

    setIsOpen(true)

    setHighlightedIndex(0)


    setTimeout(() => {

      inputRef.current?.focus()

    }, 0)

  }


  /*
  |--------------------------------------------------------------------------
  | KEYBOARD NAVIGATION
  |--------------------------------------------------------------------------
  */

  const handleKeyDown = (
    event
  ) => {

    if (!isOpen) {

      if (
        event.key ===
        'ArrowDown' ||
        event.key ===
        'Enter'
      ) {

        event.preventDefault()

        openSearch()

      }

      return

    }


    if (
      event.key ===
      'ArrowDown'
    ) {

      event.preventDefault()

      setHighlightedIndex(
        (current) =>
          Math.min(
            current + 1,
            Math.max(
              visibleCustomers.length - 1,
              0
            )
          )
      )

      return

    }


    if (
      event.key ===
      'ArrowUp'
    ) {

      event.preventDefault()

      setHighlightedIndex(
        (current) =>
          Math.max(
            current - 1,
            0
          )
      )

      return

    }


    if (
      event.key ===
      'Enter'
    ) {

      event.preventDefault()

      const customer =
        visibleCustomers[
          highlightedIndex
        ]

      if (customer) {
        selectCustomer(
          customer
        )
      }

      return

    }


    if (
      event.key ===
      'Escape'
    ) {

      event.preventDefault()

      setIsOpen(false)

      setSearch('')

    }

  }


  /*
  |--------------------------------------------------------------------------
  | SEARCHABLE CUSTOMER UI
  |--------------------------------------------------------------------------
  */

  return (

    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
      }}
    >

      <div
        style={{
          position: 'relative',
        }}
      >

        <input
          ref={inputRef}
          type="text"
          className="field-input"
          value={
            isOpen
              ? search
              : selectedCustomer?.name || ''
          }
          placeholder={
            selectedCustomer
              ? selectedCustomer.name
              : 'Search customer by name, code, phone...'
          }
          onFocus={() => {

            setIsOpen(true)

            setSearch('')

            setHighlightedIndex(0)

          }}
          onClick={() => {

            if (!isOpen) {
              openSearch()
            }

          }}
          onChange={(event) => {

            setSearch(
              event.target.value
            )

            setIsOpen(true)

            setHighlightedIndex(0)

          }}
          onKeyDown={
            handleKeyDown
          }
          autoComplete="off"
          aria-label="Search customer"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          style={{
            width: '100%',
            paddingRight:
              selectedCustomer
                ? '72px'
                : '42px',
            cursor: 'text',
          }}
        />


        {/* ---------------------------------------------------------
    CLEAR BUTTON
    --------------------------------------------------------- */}

        {selectedCustomer && (

          <button
            type="button"
            onMouseDown={(event) =>
              event.preventDefault()
            }
            onClick={
              clearCustomer
            }
            title="Clear customer"
            style={{
              position: 'absolute',
              right: '34px',
              top: '50%',
              transform:
                'translateY(-50%)',
              border: 'none',
              background:
                'transparent',
              color: '#71839a',
              cursor: 'pointer',
              fontSize: '17px',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'center',
            }}
          >
            ×
          </button>

        )}


       {/* ---------------------------------------------------------
    DROPDOWN ARROW
    --------------------------------------------------------- */}

        <span
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform:
              'translateY(-50%)',
            color: '#60758d',
            pointerEvents:
              'none',
            fontSize: '12px',
          }}
        >
          {isOpen
            ? '▲'
            : '▼'}
        </span>

      </div>

{/* ---------------------------------------------------------
    CUSTOMER RESULTS
    --------------------------------------------------------- */}

      {isOpen && (

        <div
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 5px)',
            zIndex: 9999,
            background: '#ffffff',
            border:
              '1px solid #d7e3ee',
            borderRadius: '10px',
            boxShadow:
              '0 12px 32px rgba(34, 66, 100, 0.16)',
            overflow: 'hidden',
          }}
        >

          <div
            style={{
              maxHeight: '245px',
              overflowY: 'auto',
              padding: '5px',
            }}
          >

            {visibleCustomers.length ===
            0 ? (

              <div
                style={{
                  padding:
                    '18px 14px',
                  textAlign:
                    'center',
                  color:
                    '#71839a',
                  fontSize: '13px',
                }}
              >
                No customers found.
              </div>

            ) : (

              visibleCustomers.map(
                (
                  customer,
                  index
                ) => {

                  const isSelected =
                    String(
                      customer.id
                    ) ===
                    String(value)

                  const isHighlighted =
                    index ===
                    highlightedIndex


                  return (

                    <button
                      key={
                        customer.id
                      }
                      type="button"
                      role="option"
                      aria-selected={
                        isSelected
                      }
                      onMouseDown={(
                        event
                      ) =>
                        event.preventDefault()
                      }
                      onMouseEnter={() =>
                        setHighlightedIndex(
                          index
                        )
                      }
                      onClick={() =>
                        selectCustomer(
                          customer
                        )
                      }
                      style={{
                        width: '100%',
                        display: 'block',
                        textAlign:
                          'left',
                        border: 'none',
                        borderRadius:
                          '7px',
                        background:
                          isHighlighted
                            ? '#eef6ff'
                            : isSelected
                              ? '#f5f9fd'
                              : '#ffffff',
                        padding:
                          '10px 11px',
                        cursor:
                          'pointer',
                        marginBottom:
                          '2px',
                      }}
                    >

                      <div
                        style={{
                          display:
                            'flex',
                          justifyContent:
                            'space-between',
                          alignItems:
                            'center',
                          gap: '10px',
                        }}
                      >

                        <span
                          style={{
                            fontSize:
                              '13px',
                            fontWeight:
                              600,
                            color:
                              '#173b5e',
                            overflow:
                              'hidden',
                            textOverflow:
                              'ellipsis',
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {
                            customer.name ||
                            'Unnamed customer'
                          }
                        </span>


                        {customer.code && (

                          <span
                            style={{
                              flexShrink: 0,
                              fontSize:
                                '11px',
                              fontWeight:
                                600,
                              color:
                                '#54718d',
                              background:
                                '#f0f5f9',
                              padding:
                                '3px 7px',
                              borderRadius:
                                '5px',
                            }}
                          >
                            {
                              customer.code
                            }
                          </span>

                        )}

                      </div>


                      {(customer.phone ||
                        customer.email) && (

                        <div
                          style={{
                            marginTop:
                              '4px',
                            fontSize:
                              '11px',
                            color:
                              '#71839a',
                            overflow:
                              'hidden',
                            textOverflow:
                              'ellipsis',
                            whiteSpace:
                              'nowrap',
                          }}
                        >

                          {customer.phone ||
                            customer.email}

                          {customer.phone &&
                            customer.email
                            ? ` • ${customer.email}`
                            : ''}

                        </div>

                      )}

                    </button>

                  )

                }
              )

            )}

          </div>


          {/* ---------------------------------------------------------
    RESULT COUNT
    --------------------------------------------------------- */}

          <div
            style={{
              borderTop:
                '1px solid #edf2f6',
              padding:
                '7px 11px',
              fontSize:
                '11px',
              color:
                '#7b8da0',
              background:
                '#fafcfe',
            }}
          >

            {filteredCustomers.length >
            50
              ? `Showing 50 of ${filteredCustomers.length} matching customers`
              : `${filteredCustomers.length} customer${filteredCustomers.length === 1 ? '' : 's'} found`}

            {!search && customers.length > 50 && (
              <span>
                {' '}• Type to search
              </span>
            )}

          </div>

        </div>

      )}

    </div>

  )

}


/*
|--------------------------------------------------------------------------
| OPERATIONS
|--------------------------------------------------------------------------
*/


export default function Operations({
  standaloneOrders = false,
  standaloneCustomers = false,
  standaloneProducts = false,
}) {

  const [
    tab,
    setTab,
  ] = useState(
    standaloneOrders
      ? 'orders'
      : standaloneCustomers
        ? 'customers'
        : standaloneProducts
          ? 'products'
          : 'quotations'
  )


  const [
    products,
    setProducts,
  ] = useState([])


  const [
    customers,
    setCustomers,
  ] = useState([])


  const [
    orders,
    setOrders,
  ] = useState([])


  const [
    batches,
    setBatches,
  ] = useState([])


  const [
    companies,
    setCompanies,
  ] = useState([])


  const [
    formulas,
    setFormulas,
  ] = useState([])


  const [
    lots,
    setLots,
  ] = useState([])


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
  ] = useState('')


  const [
    saving,
    setSaving,
  ] = useState(false)


  const [
    editingOrder,
    setEditingOrder,
  ] = useState(null)


  const [
    orderEditForm,
    setOrderEditForm,
  ] = useState({})




  /*
  |--------------------------------------------------------------------------
  | QUOTATION FORM
  |--------------------------------------------------------------------------
  */

  const [
    quotationForm,
    setQuotationForm,
  ] = useState({
    company: '',
    customer: '',
    number: '',
    valid_until: '',
  })


  /*
  |--------------------------------------------------------------------------
  | ORDER FORM
  |--------------------------------------------------------------------------
  */

  const [
    orderForm,
    setOrderForm,
  ] = useState({

    company: '',

    customer: '',

    number: '',

    product_name: '',

    product_type: '',

    company_code: '',

    order_date:
      new Date()
        .toISOString()
        .slice(0, 10),

    planned_mfg_date: '',

    product_code: '',

    batch_no: '',

    packing_size: '',

    batch_size: '',

    mrp_for_printing: '',

    printing_status:
      'PENDING',

    packing_type: '',

    label: '',

    box: '',

    insert: '',

    requisition_status:
      'PENDING',

  })


  /*
  |--------------------------------------------------------------------------
  | BATCH FORM
  |--------------------------------------------------------------------------
  */

  const [
    batchForm,
    setBatchForm,
  ] = useState({

    company: '',

    product: '',

    order: '',

    formula: '',

    number: '',

    planned_quantity: '',

  })


  /*
  |--------------------------------------------------------------------------
  | CONSUME FORM
  |--------------------------------------------------------------------------
  */

  const [
    consumeForm,
    setConsumeForm,
  ] = useState({

    batchId: '',

    lot: '',

    quantity: '',

  })


  /*
  |--------------------------------------------------------------------------
  | LOAD DATA
  |--------------------------------------------------------------------------
  */

  const load = async () => {

    try {

      const [

        productResponse,

        customerResponse,

        orderResponse,

        batchResponse,

        companyResponse,

        formulaResponse,

        lotResponse,

      ] = await Promise.all([

        operationsService.getProducts(),

        operationsService.getCustomers(),

        operationsService.getOrders(),

        operationsService.getBatches(),

        inventoryService.getCompanies(),

        operationsService.getFormulas(),

        inventoryService.getLots({
          qc_status: 'APPROVED',
        }),

      ])


      setProducts(
        listData(
          productResponse
        )
      )


      setCustomers(
        listData(
          customerResponse
        )
      )


      setOrders(
        listData(
          orderResponse
        )
      )


      setBatches(
        listData(
          batchResponse
        )
      )


      setCompanies(
        listData(
          companyResponse
        )
      )


      setFormulas(
        listData(
          formulaResponse
        )
      )


      setLots(
        listData(
          lotResponse
        )
      )


      return listData(
        customerResponse
      )

    } catch (err) {

      setError(
        getErrorMessage(
          err
        )
      )

    }

  }


  useEffect(() => {

    load()

  }, [])


  /*
  |--------------------------------------------------------------------------
  | MODAL
  |--------------------------------------------------------------------------
  */

  const open = (
    name,
    returnToOrder = false,
  ) => {

    setError('')

    setSuccess('')

    setCustomerReturnToOrder(
      returnToOrder
    )

    setModal(
      name
    )

  }


  const close = () => {

    if (!saving) {

      setModal('')

    }

  }




  /*
  |--------------------------------------------------------------------------
  | SAVE QUOTATION
  |--------------------------------------------------------------------------
  */

  const saveQuotation = async (
    event
  ) => {

    event.preventDefault()

    setSaving(true)

    setError('')


    try {

      await operationsService.createQuotation({

        ...quotationForm,

        lines: [],

      })


      setSuccess(
        'Company quotation created successfully.'
      )


      close()

      await load()

    } catch (err) {

      setError(
        getErrorMessage(
          err
        )
      )

    } finally {

      setSaving(false)

    }

  }


  /*
  |--------------------------------------------------------------------------
  | SAVE ORDER
  |--------------------------------------------------------------------------
  */

  const saveOrder = async (
    event
  ) => {

    event.preventDefault()

    setSaving(true)

    setError('')


    try {

      await operationsService.createOrder({

        ...orderForm,

        quotation: null,

        lines: [],

      })


      setSuccess(
        'Company customer order created successfully.'
      )


      close()

      await load()

    } catch (err) {

      setError(
        getErrorMessage(
          err
        )
      )

    } finally {

      setSaving(false)

    }

  }


  /*
  |--------------------------------------------------------------------------
  | OPEN ORDER EDIT
  |--------------------------------------------------------------------------
  */

  const openOrderEdit = (
    order
  ) => {

    setError('')

    setSuccess('')

    setEditingOrder(
      order
    )

    setOrderEditForm({
      ...order,
    })

  }


  /*
  |--------------------------------------------------------------------------
  | CLOSE ORDER EDIT
  |--------------------------------------------------------------------------
  */

  const closeOrderEdit = () => {

    if (!saving) {

      setEditingOrder(
        null
      )

      setOrderEditForm(
        {}
      )

    }

  }


  /*
  |--------------------------------------------------------------------------
  | SAVE EDITED ORDER
  |--------------------------------------------------------------------------
  */

  const saveEditedOrder = async (
    event
  ) => {

    event.preventDefault()


    if (!editingOrder) {
      return
    }


    setSaving(true)

    setError('')


    try {

      const fields =
        getOrderEditFields()


      const payload = {}


      fields.forEach(
        (field) => {

          payload[field] =
            orderEditForm[field] ??
            ''

        }
      )


      await operationsService.updateOrder(

        editingOrder.id,

        payload

      )


      setEditingOrder(
        null
      )


      setOrderEditForm(
        {}
      )


      setSuccess(
        'Sales order updated successfully.'
      )


      await load()

    } catch (err) {

      setError(
        getErrorMessage(
          err
        )
      )

    } finally {

      setSaving(false)

    }

  }


  /*
  |--------------------------------------------------------------------------
  | DELETE ORDER
  |--------------------------------------------------------------------------
  */

  const deleteOrder = async (
    id
  ) => {

    if (
      !isSuperAdmin()
    ) {

      setError(
        'Only Admin can delete sales orders.'
      )

      return

    }


    const confirmed =
      await confirmAction(
        'Are you sure you want to delete this sales order?'
      )


    if (!confirmed) {
      return
    }


    setSaving(true)

    setError('')


    try {

      await operationsService.deleteOrder(
        id
      )


      setSuccess(
        'Sales order deleted successfully.'
      )


      await load()

    } catch (err) {

      setError(
        getErrorMessage(
          err
        )
      )

    } finally {

      setSaving(false)

    }

  }


  /*
  |--------------------------------------------------------------------------
  | SAVE BATCH
  |--------------------------------------------------------------------------
  */

  const saveBatch = async (
    event
  ) => {

    event.preventDefault()

    setSaving(true)

    setError('')


    try {

      await operationsService.createBatch({

        ...batchForm,

        order:
          batchForm.order ||
          null,

        planned_quantity:
          Number(
            batchForm.planned_quantity
          ),

      })


      setSuccess(
        'Company production batch created successfully.'
      )


      close()

      await load()

    } catch (err) {

      setError(
        getErrorMessage(
          err
        )
      )

    } finally {

      setSaving(false)

    }

  }


  /*
  |--------------------------------------------------------------------------
  | CONSUME MATERIAL
  |--------------------------------------------------------------------------
  */

  const consumeMaterial = async (
    event
  ) => {

    event.preventDefault()

    setSaving(true)

    setError('')


    try {

      await operationsService.consumeBatchMaterial(

        consumeForm.batchId,

        {

          lot:
            consumeForm.lot,

          quantity:
            consumeForm.quantity,

        }

      )


      setSuccess(
        'Material consumed. A company-wise Common Stock issue transaction was created.'
      )


      close()

      await load()

    } catch (err) {

      setError(
        getErrorMessage(
          err
        )
      )

    } finally {

      setSaving(false)

    }

  }


  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (

    <div className="inv">

      <div className="inv-header">

        <div>

          <h1>
            {standaloneOrders
              ? 'Orders'
              : standaloneCustomers
                ? 'Customer Management'
                : standaloneProducts
                  ? 'Products'
                  : 'Operations'}
          </h1>

          <p>
            {standaloneOrders
              ? 'Company-wise sales orders and order traceability.'
              : standaloneCustomers
                ? 'Manage customers for the selected company.'
                : standaloneProducts
                  ? 'Manage the product master used in order lines and batch plans.'
                  : 'Company-wise production batches, quotations, orders and traceability.'}
          </p>

        </div>

      </div>


      {!standaloneOrders &&
        !standaloneCustomers &&
        !standaloneProducts && (

          <div className="inv-tabs">

            {TABS.map(
              (item) => (

                <button
                  key={item.key}
                  type="button"
                  className={
                    tab === item.key
                      ? 'inv-tab active'
                      : 'inv-tab'
                  }
                  onClick={() =>
                    setTab(
                      item.key
                    )
                  }
                >
                  {item.label}
                </button>

              )
            )}

          </div>

        )}


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


      {/* =========================================================
          PRODUCTS
          ========================================================= */}

      {tab === 'products' && (
        <ProductsPanel />
      )}


      {/* =========================================================
          CUSTOMERS
          ========================================================= */}

      {tab === 'customers' && (
        <CustomersPanel />
      )}


      {/* =========================================================
          QUOTATIONS
          ========================================================= */}

      {tab === 'quotations' && (

        <div className="inv-panel">

          <div className="inv-toolbar">

            <h3>
              Company-wise quotations
            </h3>

            <div>
              <span className="field-muted" style={{ marginRight: 10 }}>
                Not connected yet
              </span>
              <Button disabled title="Not connected yet">
                + Add quotation
              </Button>
            </div>

          </div>

          <p className="field-muted" style={{ margin: '0 0 10px' }}>
            Quotations are not saved to the server yet, so none are listed here.
          </p>


          <div className="inv-table-scroll">

            <table className="inv-table">

              <thead>

                <tr>

                  <th>
                    Number
                  </th>

                  <th>
                    Company
                  </th>

                  <th>
                    Customer
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Valid until
                  </th>

                </tr>

              </thead>


              <tbody>

                {/* Not connected: no quotation rows are shown from the mock store. */}
                {[].map(
                  (quotation) => (

                    <tr
                      key={
                        quotation.id
                      }
                    >

                      <td className="cell-strong">
                        {
                          quotation.number
                        }
                      </td>

                      <td>
                        {
                          quotation.company_name
                        }
                      </td>

                      <td>
                        {
                          quotation.customer_name
                        }
                      </td>

                      <td>
                        {
                          quotation.status
                        }
                      </td>

                      <td>
                        {
                          quotation.valid_until ||
                          '—'
                        }
                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        </div>

      )}


      {/* =========================================================
          ORDERS
          ========================================================= */}

      {tab === 'orders' && (
        <SalesOrdersPanel />
      )}


      {/* =========================================================
          BATCHES
          ========================================================= */}

      {tab === 'batches' && (

        <div className="inv-panel">

          <div className="inv-toolbar">

            <h3>
              Company-wise production batches
            </h3>


            <div>

              <span className="field-muted" style={{ marginRight: 10 }}>
                Not connected yet
              </span>
              <Button variant="secondary" disabled title="Not connected yet" style={{ marginRight: 8 }}>
                Consume common stock
              </Button>
              <Link className="btn btn-primary" to="/orders">
                Plan batch from an order
              </Link>

            </div>

          </div>


          <div className="inv-table-scroll">

            <table className="inv-table">

              <thead>

                <tr>

                  <th>
                    Batch
                  </th>

                  <th>
                    Company
                  </th>

                  <th>
                    Product
                  </th>

                  <th>
                    Order
                  </th>

                  <th>
                    Formula
                  </th>

                  <th>
                    Planned
                  </th>

                  <th>
                    Produced
                  </th>

                  <th>
                    QC
                  </th>

                  <th>
                    QA
                  </th>

                  <th>
                    Status
                  </th>

                </tr>

              </thead>


              <tbody>

                {/* Not connected: no batch rows are shown from the mock store.
                    Production batches are planned from an order (Orders page). */}
                {[].map(
                  (batch) => (

                    <tr
                      key={
                        batch.id
                      }
                    >

                      <td className="cell-strong">
                        {
                          batch.number
                        }
                      </td>

                      <td>
                        {
                          batch.company_name
                        }
                      </td>

                      <td>
                        {
                          batch.product_name
                        }
                      </td>

                      <td>
                        {
                          batch.order_number ||
                          '—'
                        }
                      </td>

                      <td>
                        {
                          batch.formula_name
                        }
                      </td>

                      <td>
                        {
                          batch.planned_quantity
                        }
                      </td>

                      <td>
                        {
                          batch.produced_quantity
                        }
                      </td>

                      <td>
                        {
                          batch.qc_status
                        }
                      </td>

                      <td>
                        {
                          batch.qa_status
                        }
                      </td>

                      <td>
                        {
                          batch.status
                        }
                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        </div>

      )}






      {/* =========================================================
          QUOTATION MODAL
          ========================================================= */}

      {modal === 'quotation' && (

        <Modal

          title="Add company quotation"

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
                onClick={
                  saveQuotation
                }
              >
                Save quotation
              </Button>

            </>

          }

        >

          {error && (

            <Alert type="error">
              {error}
            </Alert>

          )}


          <form
            onSubmit={
              saveQuotation
            }
          >

            <div className="inv-form-grid">

              <div className="field">

                <label className="field-label">
                  Company
                </label>

                <select
                  className="field-input"
                  value={
                    quotationForm.company
                  }
                  onChange={(e) =>
                    setQuotationForm({
                      ...quotationForm,
                      company:
                        e.target.value,
                    })
                  }
                  required
                >

                  <option value="">
                    Select company
                  </option>

                  {companies.map(
                    (company) => (

                      <option
                        key={
                          company.id
                        }
                        value={
                          company.id
                        }
                      >
                        {
                          company.name
                        }
                      </option>

                    )
                  )}

                </select>

              </div>


              <div className="field">

                <label className="field-label">
                  Customer
                </label>

                <select
                  className="field-input"
                  value={
                    quotationForm.customer
                  }
                  onChange={(e) =>
                    setQuotationForm({
                      ...quotationForm,
                      customer:
                        e.target.value,
                    })
                  }
                  required
                >

                  <option value="">
                    Select customer
                  </option>

                  {customers.map(
                    (customer) => (

                      <option
                        key={
                          customer.id
                        }
                        value={
                          customer.id
                        }
                      >
                        {
                          customer.name
                        }
                      </option>

                    )
                  )}

                </select>

              </div>


              <Input
                label="Quotation number"
                value={
                  quotationForm.number
                }
                onChange={(e) =>
                  setQuotationForm({
                    ...quotationForm,
                    number:
                      e.target.value,
                  })
                }
                required
              />


              <Input
                label="Valid until"
                type="date"
                value={
                  quotationForm.valid_until
                }
                onChange={(e) =>
                  setQuotationForm({
                    ...quotationForm,
                    valid_until:
                      e.target.value,
                  })
                }
              />

            </div>

          </form>

        </Modal>

      )}


      {/* =========================================================
          ADD ORDER MODAL
          ========================================================= */}

      {modal === 'order' && (

        <Modal

          title="Add company customer order"

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
                onClick={saveOrder}
              >
                Save order
              </Button>

            </>

          }

        >

          {error && (

            <Alert type="error">
              {error}
            </Alert>

          )}


          <form
            onSubmit={
              saveOrder
            }
          >

            <div className="inv-form-grid">

              <div className="field">

                <label className="field-label">
                  Company
                </label>

                <select
                  className="field-input"
                  value={
                    orderForm.company
                  }
                  onChange={(e) =>
                    setOrderForm({
                      ...orderForm,
                      company:
                        e.target.value,
                    })
                  }
                  required
                >

                  <option value="">
                    Select company
                  </option>

                  {companies.map(
                    (company) => (

                      <option
                        key={
                          company.id
                        }
                        value={
                          company.id
                        }
                      >
                        {
                          company.name
                        }
                      </option>

                    )
                  )}

                </select>

              </div>


              {/* =================================================
                  CUSTOMER - ONLY THIS PART IS CHANGED
                  ================================================= */}

              <div className="field">

                <label className="field-label">
                  Customer
                </label>

                <div
                  style={{
                    display:
                      'flex',
                    alignItems:
                      'flex-end',
                    gap: '8px',
                  }}
                >

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >

                    <SearchableCustomerSelect

                      customers={
                        customers
                      }

                      value={
                        orderForm.customer
                      }

                      onChange={(
                        customerId
                      ) =>
                        setOrderForm({
                          ...orderForm,
                          customer:
                            customerId,
                        })
                      }

                    />

                  </div>


                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      open(
                        'customer',
                        true
                      )
                    }
                  >
                    + Add customer
                  </Button>

                </div>

              </div>


              <Input
                label="Order number"
                value={
                  orderForm.number
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    number:
                      e.target.value,
                  })
                }
                required
              />


              <Input
                label="Product name"
                value={
                  orderForm.product_name
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    product_name:
                      e.target.value,
                  })
                }
              />


              <div className="field">

                <label className="field-label">
                  Type
                </label>

                <select
                  className="field-input"
                  value={
                    orderForm.product_type
                  }
                  onChange={(e) =>
                    setOrderForm({
                      ...orderForm,
                      product_type:
                        e.target.value,
                    })
                  }
                  required
                >

                  <option value="">
                    Select type
                  </option>

                  {PRODUCT_TYPE_OPTIONS.map(
                    (type) => (

                      <option
                        key={type}
                        value={type}
                      >
                        {type}
                      </option>

                    )
                  )}

                </select>

              </div>


              <Input
                label="Company code"
                value={
                  orderForm.company_code
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    company_code:
                      e.target.value,
                  })
                }
              />


              <Input
                label="Date of order"
                type="date"
                value={
                  orderForm.order_date
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    order_date:
                      e.target.value,
                  })
                }
                required
              />


              <Input
                label="Planned Mfg Date"
                type="date"
                value={
                  orderForm.planned_mfg_date
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    planned_mfg_date:
                      e.target.value,
                  })
                }
              />


              <Input
                label="Product code"
                value={
                  orderForm.product_code
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    product_code:
                      e.target.value,
                  })
                }
              />


              <Input
                label="Batch No."
                value={
                  orderForm.batch_no
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    batch_no:
                      e.target.value,
                  })
                }
              />


              <Input
                label="Packing Size"
                value={
                  orderForm.packing_size
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    packing_size:
                      e.target.value,
                  })
                }
              />


              <Input
                label="Batch Size"
                type="number"
                value={
                  orderForm.batch_size
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    batch_size:
                      e.target.value,
                  })
                }
              />


              <Input
                label="MRP for Printing"
                type="number"
                value={
                  orderForm.mrp_for_printing
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    mrp_for_printing:
                      e.target.value,
                  })
                }
              />


              <div className="field">

                <label className="field-label">
                  Printing Status
                </label>

                <select
                  className="field-input"
                  value={
                    orderForm.printing_status
                  }
                  onChange={(e) =>
                    setOrderForm({
                      ...orderForm,
                      printing_status:
                        e.target.value,
                    })
                  }
                >

                  <option value="PENDING">
                    Pending
                  </option>

                  <option value="PRINTING">
                    Printing
                  </option>

                  <option value="PRINTED">
                    Printed
                  </option>

                  <option value="HOLD">
                    Hold
                  </option>

                </select>

              </div>


              <Input
                label="Packing Type"
                value={
                  orderForm.packing_type
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    packing_type:
                      e.target.value,
                  })
                }
              />


              <Input
                label="Label"
                value={
                  orderForm.label
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    label:
                      e.target.value,
                  })
                }
              />


              <Input
                label="Box"
                value={
                  orderForm.box
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    box:
                      e.target.value,
                  })
                }
              />


              <Input
                label="Insert"
                value={
                  orderForm.insert
                }
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    insert:
                      e.target.value,
                  })
                }
              />


              <div className="field">

                <label className="field-label">
                  Requisition Status
                </label>

                <select
                  className="field-input"
                  value={
                    orderForm.requisition_status
                  }
                  onChange={(e) =>
                    setOrderForm({
                      ...orderForm,
                      requisition_status:
                        e.target.value,
                    })
                  }
                >

                  <option value="PENDING">
                    Pending
                  </option>

                  <option value="REQUESTED">
                    Requested
                  </option>

                  <option value="APPROVED">
                    Approved
                  </option>

                  <option value="REJECTED">
                    Rejected
                  </option>

                  <option value="COMPLETED">
                    Completed
                  </option>

                </select>

              </div>

            </div>

          </form>

        </Modal>

      )}


      {/* =========================================================
          EDIT ORDER MODAL
          ========================================================= */}

      {editingOrder && (

        <Modal

          title="Edit Sales Order"

          onClose={
            closeOrderEdit
          }

          footer={

            <>

              <Button
                variant="secondary"
                onClick={
                  closeOrderEdit
                }
              >
                Cancel
              </Button>


              <Button
                loading={saving}
                onClick={
                  saveEditedOrder
                }
              >
                Save Changes
              </Button>

            </>

          }

        >

          {error && (

            <Alert type="error">
              {error}
            </Alert>

          )}


          <form
            onSubmit={
              saveEditedOrder
            }
          >

            <div className="inv-form-grid">

              {getOrderEditFields().map(
                (field) => (

                  <div
                    className="field"
                    key={field}
                  >

                    <label className="field-label">

                      {
                        ORDER_FIELD_LABELS[
                          field
                        ] ||
                        field
                      }

                    </label>


                    {field ===
                      'product_type' ? (

                      <select
                        className="field-input"
                        value={
                          orderEditForm[
                            field
                          ] ?? ''
                        }
                        onChange={(e) =>
                          setOrderEditForm({
                            ...orderEditForm,
                            [field]:
                              e.target.value,
                          })
                        }
                        required
                      >

                        <option value="">
                          Select type
                        </option>

                        {PRODUCT_TYPE_OPTIONS.map(
                          (type) => (

                            <option
                              key={type}
                              value={type}
                            >
                              {type}
                            </option>

                          )
                        )}

                      </select>

                    ) : field ===
                      'printing_status' ? (

                      <select
                        className="field-input"
                        value={
                          orderEditForm[
                            field
                          ] ?? ''
                        }
                        onChange={(e) =>
                          setOrderEditForm({
                            ...orderEditForm,
                            [field]:
                              e.target.value,
                          })
                        }
                      >

                        <option value="PENDING">
                          Pending
                        </option>

                        <option value="PRINTING">
                          Printing
                        </option>

                        <option value="PRINTED">
                          Printed
                        </option>

                        <option value="HOLD">
                          Hold
                        </option>

                      </select>

                    ) : field ===
                      'requisition_status' ? (

                      <select
                        className="field-input"
                        value={
                          orderEditForm[
                            field
                          ] ?? ''
                        }
                        onChange={(e) =>
                          setOrderEditForm({
                            ...orderEditForm,
                            [field]:
                              e.target.value,
                          })
                        }
                      >

                        <option value="PENDING">
                          Pending
                        </option>

                        <option value="REQUESTED">
                          Requested
                        </option>

                        <option value="APPROVED">
                          Approved
                        </option>

                        <option value="REJECTED">
                          Rejected
                        </option>

                        <option value="COMPLETED">
                          Completed
                        </option>

                      </select>

                    ) : (

                      <Input

                        type={

                          field ===
                            'order_date' ||

                          field ===
                            'planned_mfg_date'

                            ? 'date'

                            : field ===
                                'batch_size' ||

                              field ===
                                'mrp_for_printing'

                              ? 'number'

                              : 'text'

                        }

                        value={
                          orderEditForm[
                            field
                          ] ?? ''
                        }

                        onChange={(e) =>
                          setOrderEditForm({
                            ...orderEditForm,
                            [field]:
                              e.target.value,
                          })
                        }

                      />

                    )}

                  </div>

                )
              )}

            </div>

          </form>

        </Modal>

      )}


      {/* =========================================================
          BATCH MODAL
          ========================================================= */}

      {modal === 'batch' && (

        <Modal

          title="Add company production batch"

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
                onClick={saveBatch}
              >
                Save batch
              </Button>

            </>

          }

        >

          {error && (

            <Alert type="error">
              {error}
            </Alert>

          )}


          <form
            onSubmit={
              saveBatch
            }
          >

            <div className="inv-form-grid">

              <div className="field">

                <label className="field-label">
                  Company
                </label>

                <select
                  className="field-input"
                  value={
                    batchForm.company
                  }
                  onChange={(e) =>
                    setBatchForm({
                      ...batchForm,
                      company:
                        e.target.value,
                    })
                  }
                  required
                >

                  <option value="">
                    Select company
                  </option>

                  {companies.map(
                    (company) => (

                      <option
                        key={
                          company.id
                        }
                        value={
                          company.id
                        }
                      >
                        {
                          company.name
                        }
                      </option>

                    )
                  )}

                </select>

              </div>


              <div className="field">

                <label className="field-label">
                  Product
                </label>

                <select
                  className="field-input"
                  value={
                    batchForm.product
                  }
                  onChange={(e) =>
                    setBatchForm({
                      ...batchForm,
                      product:
                        e.target.value,
                    })
                  }
                  required
                >

                  <option value="">
                    Select product
                  </option>

                  {products.map(
                    (product) => (

                      <option
                        key={
                          product.id
                        }
                        value={
                          product.id
                        }
                      >
                        {
                          product.code
                        }
                        {' — '}
                        {
                          product.name
                        }
                      </option>

                    )
                  )}

                </select>

              </div>


              <div className="field">

                <label className="field-label">
                  Formula
                </label>

                <select
                  className="field-input"
                  value={
                    batchForm.formula
                  }
                  onChange={(e) =>
                    setBatchForm({
                      ...batchForm,
                      formula:
                        e.target.value,
                    })
                  }
                  required
                >

                  <option value="">
                    Select formula
                  </option>

                  {formulas

                    .filter(
                      (formula) =>

                        !batchForm.product ||

                        String(
                          formula.product
                        ) ===
                        String(
                          batchForm.product
                        )
                    )

                    .map(
                      (formula) => (

                        <option
                          key={
                            formula.id
                          }
                          value={
                            formula.id
                          }
                        >
                          {
                            formula.code
                          }
                          {' — '}
                          {
                            formula.name
                          }
                        </option>

                      )
                    )}

                </select>

              </div>


              <div className="field">

                <label className="field-label">
                  Customer order
                </label>

                <select
                  className="field-input"
                  value={
                    batchForm.order
                  }
                  onChange={(e) =>
                    setBatchForm({
                      ...batchForm,
                      order:
                        e.target.value,
                    })
                  }
                >

                  <option value="">
                    No order linked
                  </option>

                  {orders

                    .filter(
                      (order) =>

                        !batchForm.company ||

                        String(
                          order.company
                        ) ===
                        String(
                          batchForm.company
                        )
                    )

                    .map(
                      (order) => (

                        <option
                          key={
                            order.id
                          }
                          value={
                            order.id
                          }
                        >
                          {
                            order.number
                          }
                        </option>

                      )
                    )}

                </select>

              </div>


              <Input
                label="Batch number"
                value={
                  batchForm.number
                }
                onChange={(e) =>
                  setBatchForm({
                    ...batchForm,
                    number:
                      e.target.value,
                  })
                }
                required
              />


              <Input
                label="Planned production quantity"
                type="number"
                min="0.001"
                step="0.001"
                value={
                  batchForm.planned_quantity
                }
                onChange={(e) =>
                  setBatchForm({
                    ...batchForm,
                    planned_quantity:
                      e.target.value,
                  })
                }
                required
              />

            </div>

          </form>

        </Modal>

      )}


      {/* =========================================================
          CONSUME COMMON STOCK MODAL
          ========================================================= */}

      {modal === 'consume' && (

        <Modal

          title="Consume common stock for production batch"

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
                onClick={
                  consumeMaterial
                }
              >
                Consume material
              </Button>

            </>

          }

        >

          {error && (

            <Alert type="error">
              {error}
            </Alert>

          )}


          <form
            onSubmit={
              consumeMaterial
            }
          >

            <div className="inv-form-grid">

              <div className="field">

                <label className="field-label">
                  Production batch
                </label>

                <select
                  className="field-input"
                  value={
                    consumeForm.batchId
                  }
                  onChange={(e) =>
                    setConsumeForm({
                      ...consumeForm,
                      batchId:
                        e.target.value,
                    })
                  }
                  required
                >

                  <option value="">
                    Select batch
                  </option>

                  {batches.map(
                    (batch) => (

                      <option
                        key={
                          batch.id
                        }
                        value={
                          batch.id
                        }
                      >
                        {
                          batch.number
                        }
                        {' — '}
                        {
                          batch.company_name
                        }
                      </option>

                    )
                  )}

                </select>

              </div>


              <div className="field">

                <label className="field-label">
                  Approved common-stock lot
                </label>

                <select
                  className="field-input"
                  value={
                    consumeForm.lot
                  }
                  onChange={(e) =>
                    setConsumeForm({
                      ...consumeForm,
                      lot:
                        e.target.value,
                    })
                  }
                  required
                >

                  <option value="">
                    Select lot
                  </option>

                  {lots.map(
                    (lot) => (

                      <option
                        key={
                          lot.id
                        }
                        value={
                          lot.id
                        }
                      >
                        {
                          lot.item_code
                        }
                        /
                        {
                          lot.lot_number
                        }
                        {' — '}
                        {
                          lot.available_quantity
                        }
                        {' '}
                        {
                          lot.uom_code
                        }
                      </option>

                    )
                  )}

                </select>

              </div>


              <Input
                label="Consumed quantity"
                type="number"
                min="0.001"
                step="0.001"
                value={
                  consumeForm.quantity
                }
                onChange={(e) =>
                  setConsumeForm({
                    ...consumeForm,
                    quantity:
                      e.target.value,
                  })
                }
                required
              />

            </div>

          </form>

        </Modal>

      )}

    </div>

  )

}