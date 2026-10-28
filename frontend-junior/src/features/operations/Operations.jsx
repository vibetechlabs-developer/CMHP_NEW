import {
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Modal from '../inventory/components/Modal'
import StatusPill from '../../components/StatusPill'
import { getEntityAuditLogs } from '../../utils/audit'
import { formatDateTimeIN } from '../../utils/formatters'

import { getErrorMessage } from '../../utils/errors'

import { inventoryService } from '../inventory/inventoryService'
import { operationsService } from './operationsService'

import { storage } from '../../utils/storage'
import { isSuperAdmin, getScopedCompanyId } from '../../utils/companyScope'
import { previewDocumentNumber, commitDocumentNumber } from '../../utils/documentNumbers'
import { checkFormulaStockAvailability, selectItemStock } from '../../utils/stockSelectors'
import { store } from '../../store/store'
import PageHeader from '../../components/PageHeader'
import HeroBanner from '../../components/HeroBanner'
import './Orders.css'


const TABS = [
  {
    key: 'products',
    label: 'Products',
  },
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



import {
  getOrderEditFields,
  canEditOrders,
  ORDER_FIELD_LABELS,
} from './orderPermissions'


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
}) {

  const [
    tab,
    setTab,
  ] = useState(
    standaloneOrders
      ? 'orders'
      : standaloneCustomers
        ? 'customers'
        : 'products'
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
    quotations,
    setQuotations,
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
    customerReturnToOrder,
    setCustomerReturnToOrder,
  ] = useState(false)


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
  | PRODUCT FORM
  |--------------------------------------------------------------------------
  */

  const [
    productForm,
    setProductForm,
  ] = useState({
    code: '',
    name: '',
    description: '',
  })


  /*
  |--------------------------------------------------------------------------
  | CUSTOMER FORM
  |--------------------------------------------------------------------------
  */

  const [
    customerForm,
    setCustomerForm,
  ] = useState({
    code: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    shipping_address: '',
    gstin: '',
    state: 'Gujarat',
    state_code: '24',
    payment_terms: 'Net 30',
  })

  const [
    editingCustomer,
    setEditingCustomer,
  ] = useState(null)

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerFilterStatus, setCustomerFilterStatus] = useState('')

  const [
    viewingOrder,
    setViewingOrder,
  ] = useState(null)

  const [
    orderViewTab,
    setOrderViewTab,
  ] = useState('details')

  const [produceModalOrder, setProduceModalOrder] = useState(null)
  const [produceQuantity, setProduceQuantity] = useState(1000)
  const [produceFormulaId, setProduceFormulaId] = useState('')
  const [produceError, setProduceError] = useState('')


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

        quotationResponse,

        orderResponse,

        batchResponse,

        companyResponse,

        formulaResponse,

        lotResponse,

      ] = await Promise.all([

        operationsService.getProducts(),

        operationsService.getCustomers(),

        operationsService.getQuotations(),

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


      setQuotations(
        listData(
          quotationResponse
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

    const activeCompId = getScopedCompanyId() || 'CMP-001'

    if (name === 'product') {
      setProductForm((prev) => ({
        ...prev,
        code: previewDocumentNumber('PRODUCT'),
      }))
    } else if (name === 'customer') {
      setEditingCustomer(null)
      setCustomerForm((prev) => ({
        ...prev,
        code: previewDocumentNumber('CUSTOMER'),
      }))
    } else if (name === 'quotation') {
      setQuotationForm((prev) => ({
        ...prev,
        number: previewDocumentNumber('QUOTATION', activeCompId),
      }))
    } else if (name === 'order') {
      setOrderForm((prev) => ({
        ...prev,
        number: previewDocumentNumber('SALES_ORDER', activeCompId),
        batch_no: previewDocumentNumber('BATCH', activeCompId),
      }))
    } else if (name === 'batch') {
      setBatchForm((prev) => ({
        ...prev,
        number: previewDocumentNumber('BATCH', activeCompId),
      }))
    }

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
  | SAVE PRODUCT
  |--------------------------------------------------------------------------
  */

  const saveProduct = async (
    event
  ) => {

    event.preventDefault()

    setSaving(true)

    setError('')


    try {

      const finalProductCode =
        commitDocumentNumber('PRODUCT')

      await operationsService.createProduct({

        ...productForm,

        code:
          finalProductCode,

        name:
          productForm.name.trim(),

      })


      setProductForm({

        code: '',

        name: '',

        description: '',

      })


      setSuccess(
        'Product created successfully.'
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
  | SAVE CUSTOMER
  |--------------------------------------------------------------------------
  */

  const openEditCustomer = (
    customer
  ) => {

    setError('')

    setSuccess('')

    setEditingCustomer(
      customer
    )

    setCustomerForm({
      code: customer.code || '',
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      shipping_address: customer.shipping_address || customer.address || '',
      gstin: customer.gstin || '',
      state: customer.state || 'Gujarat',
      state_code: customer.state_code || '24',
      payment_terms: customer.payment_terms || 'Net 30',
    })

    setModal(
      'customer'
    )

  }


  const handleDeleteCustomer = async (
    customer
  ) => {

    if (!customer) {
      return
    }


    const confirmed =
      window.confirm(
        `Delete ${customer.name}? This will permanently remove the customer and cannot be undone.`
      )


    if (!confirmed) {
      return
    }


    setSaving(true)

    setError('')


    try {

      await operationsService.deleteCustomer(
        customer.id
      )


      setSuccess(
        'Customer deleted successfully.'
      )


      await load()

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    } finally {

      setSaving(false)

    }

  }


  const saveCustomer = async (
    event
  ) => {

    event.preventDefault()

    setSaving(true)

    setError('')


    try {

      const customerCode =
        editingCustomer
          ? customerForm.code.trim()
          : commitDocumentNumber('CUSTOMER')

      const customerName =
        customerForm.name.trim()


      const payload = {
        ...customerForm,
        code: customerCode,
        name: customerName,
        email: customerForm.email.trim(),
        phone: customerForm.phone.trim(),
        address: customerForm.address.trim(),
        shipping_address: (customerForm.shipping_address || customerForm.address).trim(),
        gstin: (customerForm.gstin || '').trim().toUpperCase(),
        state: customerForm.state || 'Gujarat',
        state_code: customerForm.state_code || '24',
        payment_terms: customerForm.payment_terms || 'Net 30',
      }

      if (editingCustomer) {
        await operationsService.updateCustomer(
          editingCustomer.id,
          payload
        )
        setSuccess('Shared customer updated successfully.')
      } else {
        await operationsService.createCustomer(
          payload
        )
        setSuccess('Shared customer created successfully.')
      }

      setCustomerForm({
        code: '',
        name: '',
        email: '',
        phone: '',
        address: '',
        shipping_address: '',
        gstin: '',
        state: 'Gujarat',
        state_code: '24',
        payment_terms: 'Net 30',
      })


      setEditingCustomer(null)


      const loadedCustomers =
        await load()


      if (
        !editingCustomer &&
        customerReturnToOrder
      ) {

        const createdCustomer =
          loadedCustomers.find(
            (customer) =>
              String(
                customer.code || ''
              ).trim() ===
              customerCode
          )


        if (createdCustomer) {

          setOrderForm(
            (current) => ({

              ...current,

              customer:
                String(
                  createdCustomer.id
                ),

            })
          )

        }


        setCustomerReturnToOrder(false)

      }


      close()

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    } finally {

      setSaving(false)

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

      const finalQuotationNumber =
        commitDocumentNumber('QUOTATION', quotationForm.company || getScopedCompanyId())

      await operationsService.createQuotation({

        ...quotationForm,

        number:
          finalQuotationNumber,

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

      const finalOrderNumber =
        commitDocumentNumber('SALES_ORDER', orderForm.company || getScopedCompanyId())

      const deliveryDeadline = orderForm.planned_mfg_date || orderForm.delivery_deadline || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
      const qty = Number(orderForm.batch_size) || 1000
      const unitRate = Number(orderForm.mrp_for_printing) || 250
      const orderLines = [
        {
          id: `line-${Date.now()}`,
          product: orderForm.product || orderForm.product_id || '',
          product_name: orderForm.product_name || 'Pharmaceutical Formulation',
          product_code: orderForm.product_code || '',
          quantity: qty,
          unit: orderForm.packing_size || 'Box',
          rate: unitRate,
          total: qty * unitRate,
        },
      ]

      await operationsService.createOrder({
        ...orderForm,
        number: finalOrderNumber,
        batch_no: finalBatchNo,
        delivery_deadline: deliveryDeadline,
        planned_mfg_date: deliveryDeadline,
        total_amount: qty * unitRate,
        quotation: null,
        lines: orderLines,
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


  const handleConfirmOrder = async (order) => {
    try {
      setSaving(true)
      await operationsService.confirmOrder(order.id, storage.getUser())
      setSuccess(`Order ${order.number} confirmed and routed to Quality Control (QC inspection created).`)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const openProduceModal = (order) => {
    setError('')
    setSuccess('')
    setProduceError('')
    setProduceModalOrder(order)
    const qty = Number(order.batch_size || order.quantity || order.lines?.[0]?.quantity) || 1000
    setProduceQuantity(qty)

    // Match formula by product id or name
    const matchingFormula = formulas.find((f) => {
      const pName = order.product_name || ''
      const fName = f.name || ''
      return (
        String(f.product_id) === String(order.product_id || order.product) ||
        fName.toLowerCase().includes(pName.toLowerCase()) ||
        pName.toLowerCase().includes(fName.toLowerCase())
      )
    })
    setProduceFormulaId(matchingFormula ? matchingFormula.id : (formulas[0]?.id || ''))
  }

  const currentProduceFormula = useMemo(() => {
    if (!produceModalOrder) return null
    if (produceFormulaId) {
      const f = formulas.find((item) => String(item.id) === String(produceFormulaId))
      if (f) return f
    }
    const match = formulas.find((f) => {
      const pName = produceModalOrder.product_name || ''
      const fName = f.name || ''
      return (
        String(f.product_id) === String(produceModalOrder.product_id || produceModalOrder.product) ||
        fName.toLowerCase().includes(pName.toLowerCase()) ||
        pName.toLowerCase().includes(fName.toLowerCase())
      )
    })
    return match || formulas[0] || null
  }, [produceModalOrder, produceFormulaId, formulas])

  const produceStockCheck = useMemo(() => {
    if (!produceModalOrder || !currentProduceFormula) {
      return { canProduce: false, materials: [], hasShortage: false, totalShortageCount: 0 }
    }
    const erpState = store.getState()?.erp || {}
    return checkFormulaStockAvailability(
      erpState,
      currentProduceFormula,
      Number(produceQuantity) || 1000,
      currentProduceFormula.base_unit || 'kg'
    )
  }, [produceModalOrder, currentProduceFormula, produceQuantity])

  const handleStartProductionFromOrder = async () => {
    if (!produceModalOrder || !currentProduceFormula) return
    if (!produceStockCheck.canProduce) {
      setProduceError('Cannot start production: One or more raw materials have insufficient stock in inventory.')
      return
    }

    setSaving(true)
    setProduceError('')
    try {
      const compId = produceModalOrder.company || getScopedCompanyId() || 1
      const compKey = Number(compId) === 2 ? 'tej' : 'cmhp'
      const finalBatchNum = commitDocumentNumber('BATCH', compId)

      await operationsService.produceBatchFromOrder({
        orderId: produceModalOrder.id,
        orderNumber: produceModalOrder.number,
        batchNumber: finalBatchNum,
        productId: produceModalOrder.product_id || produceModalOrder.product || currentProduceFormula.product_id,
        productCode: produceModalOrder.product_code || '',
        productName: produceModalOrder.product_name || currentProduceFormula.name,
        plannedQuantity: Number(produceQuantity) || 1000,
        company: compId,
        companyKey: compKey,
        materialsToIssue: produceStockCheck.materials.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          requiredAmount: m.requiredAmount,
          issuedQuantity: m.requiredAmount,
          remark: `${m.requiredAmount.toFixed(2)} KG (${Math.ceil(m.requiredAmount / 25)} Bag)`,
        })),
      })

      setSuccess(`Production started for Batch #${finalBatchNum}. Raw materials issued outward and routed to QC inspection.`)
      setProduceModalOrder(null)
      if (viewingOrder && viewingOrder.id === produceModalOrder.id) {
        setViewingOrder(null)
      }
      await load()
    } catch (err) {
      setProduceError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

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
      window.confirm(
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

      const finalBatchNumber =
        commitDocumentNumber('BATCH', batchForm.company || getScopedCompanyId())

      await operationsService.createBatch({

        ...batchForm,

        number:
          finalBatchNumber,

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

      {standaloneCustomers ? (
        <>
          <HeroBanner
            eyebrow="Commercial Directory"
            title="Customer Management"
            subtitle="Manage shared customer accounts, billing addresses, tax identifiers, and contact details."
          />

          <PageHeader
            breadcrumbs={[
              { label: 'Workspace' },
              { label: 'Customer Management' },
            ]}
            title="Customer Master & Directory"
            subtitle="Manage shared customer accounts, billing addresses, tax identifiers, and contact details."
            statusPill={{ label: `${customers.length} Accounts`, variant: 'success' }}
            primaryAction={{
              label: '+ Add Customer',
              onClick: () => {
                setEditingCustomer(null)
                setCustomerForm({
                  code: '',
                  name: '',
                  email: '',
                  phone: '',
                  address: '',
                })
                open('customer')
              },
            }}
          />

          <div className="um-kpi-grid">
            <div className="um-kpi-card">
              <div className="um-kpi-label">Total Customers</div>
              <div className="um-kpi-value">{customers.length}</div>
              <div className="um-kpi-subtext">Registered trade accounts</div>
            </div>
            <div className="um-kpi-card">
              <div className="um-kpi-label">Active Accounts</div>
              <div className="um-kpi-value">
                {customers.filter((c) => c.is_active !== false).length}
              </div>
              <div className="um-kpi-subtext">Operational customer profiles</div>
            </div>
            <div className="um-kpi-card">
              <div className="um-kpi-label">Linked Orders</div>
              <div className="um-kpi-value">{orders.length}</div>
              <div className="um-kpi-subtext">Total sales orders placed</div>
            </div>
            <div className="um-kpi-card">
              <div className="um-kpi-label">Verified Emails</div>
              <div className="um-kpi-value">
                {customers.filter((c) => c.email && c.email.includes('@')).length}
              </div>
              <div className="um-kpi-subtext">Contactable via email</div>
            </div>
          </div>
        </>
      ) : (
        <div className="inv-header">

          <div>

            <h1>
              {standaloneOrders
                ? 'Orders'
                : 'Operations'}
            </h1>

            <p>
              {standaloneOrders
                ? 'Company-wise sales orders and order traceability.'
                : 'Company-wise production batches, quotations, orders and traceability.'}
            </p>

          </div>

        </div>
      )}


      {!standaloneOrders &&
        !standaloneCustomers && (

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

        <div className="inv-panel">

          <div className="inv-toolbar">

            <h3>
              Shared product master
            </h3>

            <Button
              onClick={() =>
                open('product')
              }
            >
              + Add product
            </Button>

          </div>


          <div className="inv-table-scroll">

            <table className="inv-table">

              <thead>

                <tr>

                  <th>
                    Code
                  </th>

                  <th>
                    Product
                  </th>

                  <th>
                    Description
                  </th>

                  <th>
                    Status
                  </th>

                </tr>

              </thead>


              <tbody>

                {products.map(
                  (product) => (

                    <tr
                      key={
                        product.id
                      }
                    >

                      <td className="cell-strong">
                        {product.code}
                      </td>

                      <td>
                        {product.name}
                      </td>

                      <td>
                        {
                          product.description ||
                          '—'
                        }
                      </td>

                      <td>
                        {
                          product.is_active
                            ? 'Active'
                            : 'Inactive'
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
          CUSTOMERS
          ========================================================= */}

      {tab === 'customers' && (

        <div className="inv-panel">

          <div className="inv-toolbar">

            <h3>
              Shared customer master
            </h3>

            <Button
              onClick={() => {

                setEditingCustomer(
                  null
                )

                setCustomerForm({

                  code: '',
                  name: '',
                  email: '',
                  phone: '',
                  address: '',

                })

                open(
                  'customer'
                )

              }}
            >
              + Add customer
            </Button>

          </div>

          {/* Customer Search and Filter Bar */}
          <div className="um-filter-bar" style={{ marginTop: '12px' }}>
            <div className="um-search-box">
              <input
                type="text"
                placeholder="Search customers by code, name, email, phone..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              {customerSearch && (
                <button
                  type="button"
                  className="um-clear-search"
                  onClick={() => setCustomerSearch('')}
                >
                  ×
                </button>
              )}
            </div>

            <div className="um-select-filter">
              <select
                value={customerFilterStatus}
                onChange={(e) => setCustomerFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            {(customerSearch || customerFilterStatus) && (
              <button
                type="button"
                className="um-clear-btn"
                onClick={() => {
                  setCustomerSearch('')
                  setCustomerFilterStatus('')
                }}
              >
                Clear Filters
              </button>
            )}

            <div className="um-count-pill">
              <strong>
                {customers.filter((c) => {
                  const q = customerSearch.trim().toLowerCase()
                  const matchesQ = !q || (c.name && c.name.toLowerCase().includes(q)) || (c.code && c.code.toLowerCase().includes(q)) || (c.email && c.email.toLowerCase().includes(q)) || (c.phone && c.phone.toLowerCase().includes(q))
                  const matchesStatus = !customerFilterStatus || (customerFilterStatus === 'ACTIVE' && c.is_active !== false) || (customerFilterStatus === 'INACTIVE' && c.is_active === false)
                  return matchesQ && matchesStatus
                }).length}
              </strong> customers
            </div>
          </div>


          <div className="inv-table-scroll">

            <table className="inv-table">

              <thead>

                <tr>

                  <th>
                    Code
                  </th>

                  <th>
                    Customer
                  </th>

                  <th>
                    Email
                  </th>

                  <th>
                    Phone
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Actions
                  </th>

                </tr>

              </thead>


              <tbody>

                {customers
                  .filter((customer) => {
                    const q = customerSearch.trim().toLowerCase()
                    const matchesQ = !q ||
                      (customer.name && customer.name.toLowerCase().includes(q)) ||
                      (customer.code && customer.code.toLowerCase().includes(q)) ||
                      (customer.email && customer.email.toLowerCase().includes(q)) ||
                      (customer.phone && customer.phone.toLowerCase().includes(q))
                    const matchesStatus = !customerFilterStatus ||
                      (customerFilterStatus === 'ACTIVE' && customer.is_active !== false) ||
                      (customerFilterStatus === 'INACTIVE' && customer.is_active === false)
                    return matchesQ && matchesStatus
                  })
                  .map(
                  (customer) => (

                    <tr
                      key={
                        customer.id
                      }
                    >

                      <td className="cell-strong">
                        {customer.code}
                      </td>

                      <td>
                        <strong>{customer.name}</strong>
                      </td>

                      <td>
                        {
                          customer.email ||
                          '—'
                        }
                      </td>

                      <td>
                        {
                          customer.phone ||
                          '—'
                        }
                      </td>

                      <td>
                        <span className={`status-pill ${customer.is_active !== false ? 'approved' : 'rejected'}`}>
                          {customer.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td>

                        <div className="customer-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>

                          <button
                            type="button"
                            className="table-edit"
                            onClick={() =>
                              openEditCustomer(
                                customer
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="table-delete"
                            onClick={() =>
                              handleDeleteCustomer(
                                customer
                              )
                            }
                            disabled={
                              saving
                            }
                          >
                            Delete
                          </button>

                        </div>

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
          QUOTATIONS
          ========================================================= */}

      {tab === 'quotations' && (

        <div className="inv-panel">

          <div className="inv-toolbar">

            <h3>
              Company-wise quotations
            </h3>

            <Button
              onClick={() =>
                open(
                  'quotation'
                )
              }
            >
              + Add quotation
            </Button>

          </div>


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

                {quotations.map(
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

        <div className="inv-panel">

          <div className="inv-toolbar">

            <div>

              <h3>
                Sales Orders
              </h3>

              <p
                style={{
                  margin:
                    '4px 0 0',
                  fontSize: 13,
                  color:
                    '#6b7f95',
                }}
              >

                {
                  isSuperAdmin()
                    ? 'Admin: full edit and delete access.'

                    : storage.getUser()?.profile?.role ===
                      'HR_MANAGER'

                      ? 'HR Manager: edit Batch No., Packing Size, Batch Size, MRP for Printing and Printing Status only.'

                      : storage.getUser()?.profile?.role ===
                        'STORES_MANAGER'

                        ? 'Store Manager: edit Packing Type, Label, Box, Insert and Requisition Status only.'

                        : 'View-only access.'
                }

              </p>

            </div>


            {isSuperAdmin() && (

              <Button
                onClick={() =>
                  open('order')
                }
              >
                + Add order
              </Button>

            )}

          </div>


          <div className="inv-table-scroll">

            <table className="inv-table">

              <thead>

                <tr>

                  <th>
                    Order No.
                  </th>

                  <th>
                    Product Name
                  </th>

                  <th>
                    Type
                  </th>

                  <th>
                    Company
                  </th>

                  <th>
                    Company Code
                  </th>

                  <th>
                    Date of Order
                  </th>

                  <th>
                    Planned Mfg Date
                  </th>

                  <th>
                    Product Code
                  </th>

                  <th>
                    Batch No.
                  </th>

                  <th>
                    Packing Size
                  </th>

                  <th>
                    Batch Size
                  </th>

                  <th>
                    MRP
                  </th>

                  <th>
                    Printing
                  </th>

                  <th>
                    Packing Type
                  </th>

                  <th>
                    Label
                  </th>

                  <th>
                    Box
                  </th>

                  <th>
                    Insert
                  </th>

                  <th>
                    Requisition
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Action
                  </th>

                </tr>

              </thead>


              <tbody>

                {orders.length === 0 ? (

                  <tr>

                    <td
                      colSpan={20}
                      style={{
                        textAlign:
                          'center',
                        padding:
                          32,
                      }}
                    >
                      No sales orders found for
                      the active company.
                    </td>

                  </tr>

                ) : (

                  orders.map(
                    (order) => (

                      <tr
                        key={
                          order.id
                        }
                      >

                        <td className="cell-strong">
                          {
                            order.number ||
                            `ORD-${order.id}`
                          }
                        </td>


                        <td>
                          {
                            order.product_name ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.product_type ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.company_name ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.company_code ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.order_date ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.planned_mfg_date ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.product_code ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.batch_no ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.packing_size ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.batch_size ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.mrp_for_printing ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.printing_status ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.packing_type ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.label ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.box ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.insert ||
                            '—'
                          }
                        </td>


                        <td>
                          {
                            order.requisition_status ||
                            '—'
                          }
                        </td>


                        <td>
                          <StatusPill
                            tone={
                              order.status === 'PAID' || order.status === 'READY_TO_INVOICE' || order.status === 'QA_APPROVED'
                                ? 'success'
                                : order.status === 'QC_FAILED' || order.status === 'QA_REJECTED'
                                ? 'danger'
                                : order.status === 'QC_PENDING' || order.status === 'QA_PENDING' || order.status === 'INVOICED'
                                ? 'info'
                                : 'neutral'
                            }
                          >
                            {order.status || 'DRAFT'}
                          </StatusPill>
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="table-edit"
                              onClick={() => {
                                setViewingOrder(order)
                                setOrderViewTab('details')
                              }}
                            >
                              View
                            </button>

                            {(!order.status || order.status === 'DRAFT' || order.status === 'CONFIRMED') && (
                              <button
                                type="button"
                                className="table-edit"
                                style={{ backgroundColor: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0', fontWeight: 600 }}
                                onClick={() => openProduceModal(order)}
                                title="Produce batch automatically from formula BOM"
                              >
                                Produce (BOM)
                              </button>
                            )}

                            {canEditOrders() && (
                              <button
                                type="button"
                                className="table-edit"
                                onClick={() => openOrderEdit(order)}
                              >
                                Edit
                              </button>
                            )}

                            {isSuperAdmin() && (
                              <button
                                type="button"
                                className="table-delete"
                                onClick={() => deleteOrder(order.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>

                      </tr>

                    )
                  )

                )}

              </tbody>

            </table>

          </div>

        </div>

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

              <Button
                variant="secondary"
                onClick={() =>
                  open('consume')
                }
                style={{
                  marginRight: 8,
                }}
              >
                Consume common stock
              </Button>


              <Button
                onClick={() =>
                  open('batch')
                }
              >
                + Add batch
              </Button>

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

                {batches.map(
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
          PRODUCT MODAL
          ========================================================= */}

      {modal === 'product' && (

        <Modal

          title="Add shared product"

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
                onClick={saveProduct}
              >
                Save product
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
              saveProduct
            }
          >

            <div className="inv-form-grid">

              <Input
                label="Product code (Auto-Generated)"
                value={
                  productForm.code
                }
                readOnly
                disabled
                style={{ backgroundColor: 'var(--surface-hover)', cursor: 'not-allowed' }}
              />


              <Input
                label="Product name"
                value={
                  productForm.name
                }
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    name:
                      e.target.value,
                  })
                }
                required
              />


              <div className="field field-full">

                <label className="field-label">
                  Description
                </label>

                <textarea
                  className="field-input"
                  value={
                    productForm.description
                  }
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      description:
                        e.target.value,
                    })
                  }
                />

              </div>

            </div>

          </form>

        </Modal>

      )}


      {/* =========================================================
          CUSTOMER MODAL
          ========================================================= */}

      {modal === 'customer' && (

        <Modal

          title={
            editingCustomer
              ? 'Edit shared customer'
              : 'Add shared customer'
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
                onClick={saveCustomer}
              >
                {
                  editingCustomer
                    ? 'Update customer'
                    : 'Save customer'
                }
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
              saveCustomer
            }
          >

            <div className="inv-form-grid">
              <Input
                label="Customer code (Auto-Generated)"
                value={customerForm.code}
                readOnly
                disabled
                style={{ backgroundColor: 'var(--surface-hover)', cursor: 'not-allowed' }}
              />

              <Input
                label="Customer name *"
                value={customerForm.name}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    name: e.target.value,
                  })
                }
                required
              />

              <Input
                label="GSTIN (15-Digit GST Number)"
                value={customerForm.gstin}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    gstin: e.target.value.toUpperCase(),
                  })
                }
                placeholder="e.g. 24AAACC1234P1Z5"
              />

              <div className="field">
                <label className="field-label">State / Place of Supply</label>
                <select
                  className="field-input"
                  value={customerForm.state_code}
                  onChange={(e) => {
                    const code = e.target.value
                    const stateName = code === '24' ? 'Gujarat' : code === '27' ? 'Maharashtra' : code === '29' ? 'Karnataka' : code === '07' ? 'Delhi' : 'Other State'
                    setCustomerForm({
                      ...customerForm,
                      state_code: code,
                      state: stateName,
                    })
                  }}
                >
                  <option value="24">24 - Gujarat (Intra-State CGST+SGST)</option>
                  <option value="27">27 - Maharashtra (Inter-State IGST)</option>
                  <option value="29">29 - Karnataka (Inter-State IGST)</option>
                  <option value="07">07 - Delhi (Inter-State IGST)</option>
                  <option value="99">99 - Other State / Inter-State</option>
                </select>
              </div>

              <div className="field">
                <label className="field-label">Payment Terms</label>
                <select
                  className="field-input"
                  value={customerForm.payment_terms}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      payment_terms: e.target.value,
                    })
                  }
                >
                  <option value="Net 30">Net 30 Days</option>
                  <option value="Net 15">Net 15 Days</option>
                  <option value="Net 45">Net 45 Days</option>
                  <option value="Net 60">Net 60 Days</option>
                  <option value="Immediate">Immediate / Advance</option>
                </select>
              </div>

              <Input
                label="Email"
                type="email"
                value={customerForm.email}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    email: e.target.value,
                  })
                }
              />

              <Input
                label="Phone"
                value={customerForm.phone}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    phone: e.target.value,
                  })
                }
              />

              <div className="field field-full">
                <label className="field-label">Billing Address</label>
                <textarea
                  className="field-input"
                  rows={2}
                  value={customerForm.address}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      address: e.target.value,
                    })
                  }
                  placeholder="Registered company billing address"
                />
              </div>

              <div className="field field-full">
                <label className="field-label">Shipping Address</label>
                <textarea
                  className="field-input"
                  rows={2}
                  value={customerForm.shipping_address}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      shipping_address: e.target.value,
                    })
                  }
                  placeholder="Warehouse / delivery destination (leave blank if same as billing)"
                />
              </div>
            </div>

          </form>

        </Modal>

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
                label="Quotation number (Auto-Generated)"
                value={
                  quotationForm.number
                }
                readOnly
                disabled
                style={{ backgroundColor: 'var(--surface-hover)', cursor: 'not-allowed' }}
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
                label="Order number (Auto-Generated)"
                value={
                  orderForm.number
                }
                readOnly
                disabled
                style={{ backgroundColor: 'var(--surface-hover)', cursor: 'not-allowed' }}
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
                label="Batch No. (Auto-Generated)"
                value={
                  orderForm.batch_no
                }
                readOnly
                disabled
                style={{ backgroundColor: 'var(--surface-hover)', cursor: 'not-allowed' }}
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
                label="Batch number (Auto-Generated)"
                value={
                  batchForm.number
                }
                readOnly
                disabled
                style={{ backgroundColor: 'var(--surface-hover)', cursor: 'not-allowed' }}
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

      {/* =========================================================
          PRODUCE BATCH FROM ORDER (FORMULA BOM) MODAL
          ========================================================= */}
      {produceModalOrder && (
        <Modal
          title={`Produce Batch: Order #${produceModalOrder.number}`}
          onClose={() => setProduceModalOrder(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Order Number</span>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{produceModalOrder.number}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Customer</span>
                <div style={{ fontWeight: 600 }}>{produceModalOrder.customer_name || 'Direct Customer'}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Product</span>
                <div style={{ fontWeight: 600, color: '#0284c7' }}>{produceModalOrder.product_name}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Due / Delivery Date</span>
                <div style={{ fontWeight: 600, color: produceModalOrder.delivery_deadline ? '#d97706' : '#64748b' }}>
                  {produceModalOrder.delivery_deadline || produceModalOrder.planned_mfg_date || 'No deadline'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Batch Quantity (to produce)
                </label>
                <Input
                  type="number"
                  min="1"
                  value={produceQuantity}
                  onChange={(e) => setProduceQuantity(e.target.value)}
                  placeholder="Batch quantity"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  BOM Formula
                </label>
                <select
                  className="input-select"
                  value={currentProduceFormula?.id || ''}
                  onChange={(e) => setProduceFormulaId(e.target.value)}
                  style={{ width: '100%', height: '38px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 10px' }}
                >
                  {formulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (Base: {f.base_quantity} {f.base_unit})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {produceError && <Alert type="error">{produceError}</Alert>}

            {/* Formula Raw Materials Availability Check */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#334155' }}>
                  Raw Material Requirements & Live Stock Verification
                </h4>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Formula Base: {currentProduceFormula?.base_quantity || 100} {currentProduceFormula?.base_unit || 'g'} | Scale: {produceStockCheck.scaleFactor ? produceStockCheck.scaleFactor.toFixed(2) : '1.0'}x
                </span>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Material</th>
                      <th style={{ padding: '8px 12px' }}>Base Qty</th>
                      <th style={{ padding: '8px 12px' }}>Required Qty</th>
                      <th style={{ padding: '8px 12px' }}>Stock Available</th>
                      <th style={{ padding: '8px 12px' }}>Shortage</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produceStockCheck.materials.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>
                          No raw materials defined for this formula. Select or create a formula revision in Products.
                        </td>
                      </tr>
                    ) : (
                      produceStockCheck.materials.map((m, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: m.isSufficient ? 'white' : '#fff1f2' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{m.name}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{m.baseQuantity} {m.unit}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{m.requiredAmount.toFixed(2)} {m.unit}</td>
                          <td style={{ padding: '8px 12px', color: m.isSufficient ? '#16a34a' : '#e11d48', fontWeight: 600 }}>
                            {m.availableStock.toFixed(2)} {m.unit}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#e11d48', fontWeight: 700 }}>
                            {m.shortage > 0 ? `-${m.shortage.toFixed(2)} ${m.unit}` : '0'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: m.isSufficient ? '#dcfce7' : '#fee2e2',
                              color: m.isSufficient ? '#15803d' : '#b91c1c',
                            }}>
                              {m.isSufficient ? 'In Stock' : 'SHORTAGE'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shortage warning or green confirmation */}
            {produceStockCheck.hasShortage ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '6px', color: '#991b1b', fontSize: '13px' }}>
                <strong>⚠️ Production Blocked:</strong> Stock is insufficient for {produceStockCheck.totalShortageCount} raw material(s). Inward stock into inventory before issuing to production.
              </div>
            ) : (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px', color: '#166534', fontSize: '13px' }}>
                <strong>✓ Stock Verified:</strong> All required raw materials are available in inventory. Starting production will issue materials outward from the Stock Ledger and schedule QC inspection.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <Button variant="secondary" onClick={() => setProduceModalOrder(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={produceStockCheck.hasShortage || saving || produceStockCheck.materials.length === 0}
                onClick={handleStartProductionFromOrder}
                style={{
                  backgroundColor: produceStockCheck.hasShortage ? '#cbd5e1' : '#16a34a',
                  cursor: produceStockCheck.hasShortage ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Issuing Materials...' : produceStockCheck.hasShortage ? 'Production Blocked (Shortage)' : 'Start Production & Issue Materials'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* =========================================================
          VIEW SALES ORDER MODAL WITH AUDIT HISTORY
          ========================================================= */}
      {viewingOrder && (
        <Modal
          title={`Sales Order ${viewingOrder.number}`}
          onClose={() => setViewingOrder(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(!viewingOrder.status || viewingOrder.status === 'DRAFT' || viewingOrder.status === 'CONFIRMED') && (
                  <Button
                    onClick={() => openProduceModal(viewingOrder)}
                    style={{ backgroundColor: '#059669' }}
                  >
                    Produce Batch (Formula BOM)
                  </Button>
                )}
                {(!viewingOrder.status || viewingOrder.status === 'DRAFT') && (
                  <Button
                    onClick={() => {
                      handleConfirmOrder(viewingOrder)
                      setViewingOrder(null)
                    }}
                    style={{ backgroundColor: '#1d4ed8' }}
                  >
                    Confirm & Route to QC
                  </Button>
                )}
              </div>
              <Button variant="secondary" onClick={() => setViewingOrder(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="inv-view-tabs" style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '16px' }}>
            <button
              type="button"
              className={`inv-tab-btn ${orderViewTab === 'details' ? 'active' : ''}`}
              onClick={() => setOrderViewTab('details')}
            >
              Order Details & Traceability
            </button>
            <button
              type="button"
              className={`inv-tab-btn ${orderViewTab === 'activity' ? 'active' : ''}`}
              onClick={() => setOrderViewTab('activity')}
            >
              Activity & Audit History
            </button>
          </div>

          {orderViewTab === 'details' && (
            <div>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Order No</span>
                    <strong>{viewingOrder.number}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Customer</span>
                    <strong>{viewingOrder.customer_name || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Order Date</span>
                    <strong>{viewingOrder.order_date || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Overall Status</span>
                    <StatusPill tone={viewingOrder.status === 'PAID' || viewingOrder.status === 'READY_TO_INVOICE' ? 'success' : viewingOrder.status === 'QC_FAILED' ? 'danger' : 'info'}>
                      {viewingOrder.status || 'DRAFT'}
                    </StatusPill>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div style={{ border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#0b73df', textTransform: 'uppercase' }}>Product Specifications</h4>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>Product: <strong>{viewingOrder.product_name || '—'}</strong> ({viewingOrder.product_type || 'Formulation'})</p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>Product Code: <strong>{viewingOrder.product_code || '—'}</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>Packing Size: <strong>{viewingOrder.packing_size || '—'}</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>Batch Size: <strong>{viewingOrder.batch_size || '—'}</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>MRP for Printing: <strong>₹{viewingOrder.mrp_for_printing || '0'}</strong></p>
                </div>

                <div style={{ border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#0b73df', textTransform: 'uppercase' }}>Workflow & Quality Clearance</h4>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>Batch No: <strong>{viewingOrder.batch_no || '—'}</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>Planned Mfg: <strong>{viewingOrder.planned_mfg_date || '—'}</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>QC Inspection: <strong style={{ color: viewingOrder.qc_status === 'PASSED' ? '#059669' : viewingOrder.qc_status === 'FAILED' ? '#dc2626' : '#2563eb' }}>{viewingOrder.qc_status || 'PENDING'}</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>QA Release: <strong style={{ color: viewingOrder.qa_status === 'APPROVED' ? '#059669' : viewingOrder.qa_status === 'REJECTED' ? '#dc2626' : '#2563eb' }}>{viewingOrder.qa_status || 'PENDING'}</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>Invoiced Quantity: <strong>{viewingOrder.invoiced_qty || 0} / {viewingOrder.batch_size || 1000}</strong></p>
                </div>
              </div>

              {(!viewingOrder.status || viewingOrder.status === 'DRAFT') && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#1e40af' }}>
                    This order is in <strong>DRAFT</strong> status. Confirming the order will lock initial specs and automatically trigger the <strong>QC Inspection</strong>.
                  </p>
                  <Button
                    onClick={() => {
                      handleConfirmOrder(viewingOrder)
                      setViewingOrder(null)
                    }}
                    style={{ backgroundColor: '#1d4ed8' }}
                  >
                    Confirm Order & Schedule QC Inspection
                  </Button>
                </div>
              )}
            </div>
          )}

          {orderViewTab === 'activity' && (
            <div>
              <h4 style={{ margin: '0 0 12px', color: '#163b59' }}>Audit Trail for Order {viewingOrder.number}</h4>
              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Timestamp (IST)</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Description</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getEntityAuditLogs('Order', viewingOrder.number).map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTimeIN(log.timestamp)}</td>
                        <td>
                          <strong>{log.user_name || log.user_id}</strong>
                          <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>{log.role}</span>
                        </td>
                        <td><span style={{ fontWeight: 700, color: '#0b73df' }}>{log.action}</span></td>
                        <td>{log.description}</td>
                        <td>{log.remarks || '—'}</td>
                      </tr>
                    ))}
                    {getEntityAuditLogs('Order', viewingOrder.number).length === 0 && (
                      <tr>
                        <td colSpan={5} className="inv-empty">
                          No audit entries found for this order.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

    </div>
  )
}