import { confirmAction } from '../../components/ConfirmProvider'
import {
  useEffect,
  useState,
} from 'react'

import {
  supplyChainService,
} from './supplyChainService'

import './SupplyChain.css'

const TABS = [
  {
    key: 'purchase',
    label: 'Purchase',
  },
  {
    key: 'allocation',
    label: 'Internal Allocation',
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
  },
  {
    key: 'returns',
    label: 'Returns & Recall',
  },
]


const emptySupplier = {
  code: '',
  name: '',
  gst_number: '',
  phone: '',
  email: '',
  address: '',
}


const emptyPO = {
  po_number: '',
  company: '',
  supplier: '',
  order_date: '',
  expected_date: '',
  notes: '',
}


const emptyGRN = {
  grn_number: '',
  company: '',
  supplier: '',
  po: '',
  item: '',
  location: '',
  lot_number: '',
  quantity: '',
  manufacture_date: '',
  expiry_date: '',
}


const emptyBill = {
  bill_number: '',
  company: '',
  supplier: '',
  bill_date: '',
  total_amount: '',
  paid_amount: '',
}


const emptyAllocation = {
  company: '',
  item: '',
  lot: '',
  quantity: '',
  reference_note: '',
}


const emptyDispatch = {
  dispatch_number: '',
  company: '',
  customer: '',
  batch: '',
  invoice: '',
  dispatch_date: '',
  notes: '',
}


const emptyReturn = {
  return_number: '',
  company: '',
  customer: '',
  invoice: '',
  return_date: '',
  quantity: '',
  reason: '',
}


const emptyRecall = {
  recall_number: '',
  company: '',
  batch: '',
  recall_date: '',
  reason: '',
}


function Field({
  label,
  children,
  required = false,
}) {
  return (
    <div className="sc-field">

      <label>
        {label}

        {required && (
          <span className="required">
            *
          </span>
        )}
      </label>

      {children}

    </div>
  )
}


function Select({
  value,
  onChange,
  children,
  required = false,
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      required={required}
    >
      {children}
    </select>
  )
}


function Input({
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
    />
  )
}


export default function SupplyChain() {

  const [
    activeTab,
    setActiveTab,
  ] = useState('purchase')


  // ==========================================================
  // MASTER DATA
  // ==========================================================

  const [companies, setCompanies] =
    useState([])

  const [suppliers, setSuppliers] =
    useState([])

  const [items, setItems] =
    useState([])

  const [locations, setLocations] =
    useState([])

  const [lots, setLots] =
    useState([])

  const [customers, setCustomers] =
    useState([])

  const [batches, setBatches] =
    useState([])

  const [invoices, setInvoices] =
    useState([])


  // ==========================================================
  // TRANSACTION DATA
  // ==========================================================

  const [
    purchaseOrders,
    setPurchaseOrders,
  ] = useState([])

  const [
    goodsReceipts,
    setGoodsReceipts,
  ] = useState([])

  const [
    purchaseBills,
    setPurchaseBills,
  ] = useState([])

  const [
    allocations,
    setAllocations,
  ] = useState([])

  const [
    dispatches,
    setDispatches,
  ] = useState([])

  const [
    salesReturns,
    setSalesReturns,
  ] = useState([])

  const [
    recalls,
    setRecalls,
  ] = useState([])


  // ==========================================================
  // UI
  // ==========================================================

  const [error, setError] =
    useState('')

  const [success, setSuccess] =
    useState('')

  const [modal, setModal] =
    useState(null)


  // ==========================================================
  // FORMS
  // ==========================================================

  const [supplierForm, setSupplierForm] =
    useState(emptySupplier)

  const [poForm, setPoForm] =
    useState(emptyPO)

  const [grnForm, setGrnForm] =
    useState(emptyGRN)

  const [billForm, setBillForm] =
    useState(emptyBill)

  const [allocationForm, setAllocationForm] =
    useState(emptyAllocation)

  const [dispatchForm, setDispatchForm] =
    useState(emptyDispatch)

  const [returnForm, setReturnForm] =
    useState(emptyReturn)

  const [recallForm, setRecallForm] =
    useState(emptyRecall)


  // ==========================================================
  // LOAD EVERYTHING
  // ==========================================================

  const loadData = async () => {

    try {

      setError('')

      const [
        companyResponse,
        supplierResponse,
        itemResponse,
        locationResponse,
        lotResponse,
        customerResponse,
        batchResponse,
        invoiceResponse,

        poResponse,
        grnResponse,
        billResponse,
        allocationResponse,
        dispatchResponse,
        returnResponse,
        recallResponse,
      ] = await Promise.all([

        supplyChainService.getCompanies(),

        supplyChainService.getSuppliers(),

        supplyChainService.getItems(),

        supplyChainService.getLocations(),

        supplyChainService.getLots(),

        supplyChainService.getCustomers(),

        supplyChainService.getBatches(),

        supplyChainService.getInvoices(),

        supplyChainService.getPurchaseOrders(),

        supplyChainService.getGoodsReceipts(),

        supplyChainService.getPurchaseBills(),

        supplyChainService.getInternalAllocations(),

        supplyChainService.getDispatches(),

        supplyChainService.getSalesReturns(),

        supplyChainService.getRecalls(),
      ])


      setCompanies(
        companyResponse.data || []
      )

      setSuppliers(
        supplierResponse.data || []
      )

      setItems(
        itemResponse.data || []
      )

      setLocations(
        locationResponse.data || []
      )

      setLots(
        lotResponse.data || []
      )

      setCustomers(
        customerResponse.data || []
      )

      setBatches(
        batchResponse.data || []
      )

      setInvoices(
        invoiceResponse.data || []
      )

      setPurchaseOrders(
        poResponse.data || []
      )

      setGoodsReceipts(
        grnResponse.data || []
      )

      setPurchaseBills(
        billResponse.data || []
      )

      setAllocations(
        allocationResponse.data || []
      )

      setDispatches(
        dispatchResponse.data || []
      )

      setSalesReturns(
        returnResponse.data || []
      )

      setRecalls(
        recallResponse.data || []
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to load Supply Chain data.'
      )

    }
  }


  useEffect(() => {
    loadData()
  }, [])


  // ==========================================================
  // MESSAGE
  // ==========================================================

  const showSuccess = (message) => {

    setSuccess(message)

    setError('')

    setTimeout(() => {
      setSuccess('')
    }, 2500)
  }


  // ==========================================================
  // MODAL
  // ==========================================================

  const closeModal = () => {

    setModal(null)

    setError('')

    setSupplierForm(
      emptySupplier
    )

    setPoForm(
      emptyPO
    )

    setGrnForm(
      emptyGRN
    )

    setBillForm(
      emptyBill
    )

    setAllocationForm(
      emptyAllocation
    )

    setDispatchForm(
      emptyDispatch
    )

    setReturnForm(
      emptyReturn
    )

    setRecallForm(
      emptyRecall
    )
  }


  // ==========================================================
  // SUPPLIER
  // ==========================================================

  const saveSupplier = async (event) => {

    event.preventDefault()

    try {

      if (!supplierForm.name.trim()) {
        throw new Error(
          'Supplier name is required.'
        )
      }

      await supplyChainService.createSupplier(
        supplierForm
      )

      closeModal()

      await loadData()

      showSuccess(
        'Supplier created in demo data only (not saved to the server).'
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to create supplier.'
      )
    }
  }


  // ==========================================================
  // PURCHASE ORDER
  // ==========================================================

  const savePurchaseOrder = async (event) => {

    event.preventDefault()

    try {

      if (!poForm.company) {
        throw new Error(
          'Please select a company.'
        )
      }

      if (!poForm.supplier) {
        throw new Error(
          'Please select a supplier.'
        )
      }

      await supplyChainService.createPurchaseOrder(
        poForm
      )

      closeModal()

      await loadData()

      showSuccess(
        'Purchase Order created in demo data only (not saved to the server).'
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to create Purchase Order.'
      )
    }
  }


  // ==========================================================
  // GOODS RECEIPT
  // ==========================================================

  const saveGoodsReceipt = async (event) => {

    event.preventDefault()

    try {

      if (!grnForm.company) {
        throw new Error(
          'Please select a company.'
        )
      }

      if (!grnForm.supplier) {
        throw new Error(
          'Please select a supplier.'
        )
      }

      if (!grnForm.item) {
        throw new Error(
          'Please select a material.'
        )
      }

      if (!grnForm.location) {
        throw new Error(
          'Please select a storage location.'
        )
      }

      if (!grnForm.quantity) {
        throw new Error(
          'Please enter quantity.'
        )
      }

      await supplyChainService.createGoodsReceipt(
        grnForm
      )

      closeModal()

      await loadData()

      showSuccess(
        'Goods Receipt created and stock updated.'
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to create Goods Receipt.'
      )
    }
  }


  // ==========================================================
  // PURCHASE BILL
  // ==========================================================

  const savePurchaseBill = async (event) => {

    event.preventDefault()

    try {

      if (!billForm.company) {
        throw new Error(
          'Please select a company.'
        )
      }

      if (!billForm.supplier) {
        throw new Error(
          'Please select a supplier.'
        )
      }

      await supplyChainService.createPurchaseBill(
        billForm
      )

      closeModal()

      await loadData()

      showSuccess(
        'Purchase Bill created in demo data only (not saved to the server).'
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to create Purchase Bill.'
      )
    }
  }


  // ==========================================================
  // INTERNAL ALLOCATION
  // ==========================================================

  const saveAllocation = async (event) => {

    event.preventDefault()

    try {

      if (!allocationForm.company) {
        throw new Error(
          'Please select a company.'
        )
      }

      if (!allocationForm.item) {
        throw new Error(
          'Please select a material.'
        )
      }

      if (!allocationForm.lot) {
        throw new Error(
          'Please select a lot.'
        )
      }

      await supplyChainService.createInternalAllocation(
        allocationForm
      )

      closeModal()

      await loadData()

      showSuccess(
        'Material allocated to company in demo data only (not saved to the server).'
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to create allocation.'
      )
    }
  }


  // ==========================================================
  // DISPATCH
  // ==========================================================

  const saveDispatch = async (event) => {

    event.preventDefault()

    try {

      if (!dispatchForm.company) {
        throw new Error(
          'Please select a company.'
        )
      }

      await supplyChainService.createDispatch(
        dispatchForm
      )

      closeModal()

      await loadData()

      showSuccess(
        'Dispatch created in demo data only (not saved to the server).'
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to create dispatch.'
      )
    }
  }


  // ==========================================================
  // RETURN
  // ==========================================================

  const saveReturn = async (event) => {

    event.preventDefault()

    try {

      if (!returnForm.company) {
        throw new Error(
          'Please select a company.'
        )
      }

      await supplyChainService.createSalesReturn(
        returnForm
      )

      closeModal()

      await loadData()

      showSuccess(
        'Sales return created in demo data only (not saved to the server).'
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to create sales return.'
      )
    }
  }


  // ==========================================================
  // RECALL
  // ==========================================================

  const saveRecall = async (event) => {

    event.preventDefault()

    try {

      if (!recallForm.company) {
        throw new Error(
          'Please select a company.'
        )
      }

      await supplyChainService.createRecall(
        recallForm
      )

      closeModal()

      await loadData()

      showSuccess(
        'Recall created in demo data only (not saved to the server).'
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to create recall.'
      )
    }
  }


  // ==========================================================
  // DELETE
  // ==========================================================

  const deleteRow = async (
    type,
    id
  ) => {

    const confirmed =
      await confirmAction(
        'Are you sure you want to delete this record?'
      )

    if (!confirmed) {
      return
    }

    try {

      if (type === 'supplier') {
        await supplyChainService.deleteSupplier(id)
      }

      if (type === 'po') {
        await supplyChainService.deletePurchaseOrder(id)
      }

      if (type === 'grn') {
        await supplyChainService.deleteGoodsReceipt(id)
      }

      if (type === 'bill') {
        await supplyChainService.deletePurchaseBill(id)
      }

      if (type === 'allocation') {
        await supplyChainService.deleteInternalAllocation(id)
      }

      if (type === 'dispatch') {
        await supplyChainService.deleteDispatch(id)
      }

      if (type === 'return') {
        await supplyChainService.deleteSalesReturn(id)
      }

      if (type === 'recall') {
        await supplyChainService.deleteRecall(id)
      }

      await loadData()

      showSuccess(
        'Record deleted in demo data only (not saved to the server).'
      )

    } catch (err) {

      setError(
        err?.message ||
        'Unable to delete record.'
      )
    }
  }


  // ==========================================================
  // COMPANY OPTIONS
  // ==========================================================

  const CompanyOptions = () => (
    <>
      <option value="">
        Select company
      </option>

      {companies.map((company) => (
        <option
          key={company.id}
          value={company.id}
        >
          {company.name}
        </option>
      ))}
    </>
  )


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="supply-chain">

      <header className="sc-header">

        <div>

          <span className="sc-eyebrow">
            CMHP PHARMACEUTICAL ERP
          </span>

          <h1>
            Supply Chain Management
          </h1>

          <p>
            Purchase, internal material allocation,
            dispatch, sales returns and product recall.
          </p>

        </div>

      </header>


      {error && (
        <div className="sc-alert error">
          {error}
        </div>
      )}


      {success && (
        <div className="sc-alert success">
          {success}
        </div>
      )}


      <div className="sc-tabs">

        {TABS.map((tab) => {

          let count = 0

          if (tab.key === 'purchase') {
            count =
              purchaseOrders.length +
              goodsReceipts.length +
              purchaseBills.length
          }

          if (tab.key === 'allocation') {
            count =
              allocations.length
          }

          if (tab.key === 'dispatch') {
            count =
              dispatches.length
          }

          if (tab.key === 'returns') {
            count =
              salesReturns.length +
              recalls.length
          }

          return (
            <button
              key={tab.key}
              type="button"
              className={
                activeTab === tab.key
                  ? 'sc-tab active'
                  : 'sc-tab'
              }
              onClick={() =>
                setActiveTab(tab.key)
              }
            >
              {tab.label}

              <span>
                {count}
              </span>
            </button>
          )
        })}

        <button
          type="button"
          className="sc-refresh"
          onClick={loadData}
          aria-label="Refresh supply chain data"
          style={{ marginLeft: 'auto', flexShrink: 0 }}
        >
          Refresh
        </button>

      </div>


      {/* ====================================================
          PURCHASE
          ==================================================== */}

      {activeTab === 'purchase' && (
        <>

          <div className="sc-action-grid">

            <button
              type="button"
              className="sc-action-card"
              onClick={() =>
                setModal('supplier')
              }
            >
              <strong>
                Add Supplier
              </strong>

              <span>
                Create supplier master
              </span>
            </button>


            <button
              type="button"
              className="sc-action-card"
              onClick={() =>
                setModal('po')
              }
            >
              <strong>
                Create Purchase Order
              </strong>

              <span>
                Supplier → Company → PO
              </span>
            </button>


            <button
              type="button"
              className="sc-action-card"
              onClick={() =>
                setModal('grn')
              }
            >
              <strong>
                Create Goods Receipt
              </strong>

              <span>
                PO → GRN → Stock
              </span>
            </button>


            <button
              type="button"
              className="sc-action-card"
              onClick={() =>
                setModal('bill')
              }
            >
              <strong>
                Create Purchase Bill
              </strong>

              <span>
                Supplier invoice & payable
              </span>
            </button>

          </div>


          <Section
            title="Suppliers"
            subtitle="Supplier master records"
          >

            <Table>

              <thead>
                <tr>
                  <th>CODE</th>
                  <th>SUPPLIER</th>
                  <th>PHONE</th>
                  <th>EMAIL</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>

                {suppliers.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    text="No suppliers added yet."
                  />
                ) : (
                  suppliers.map(
                    (supplier) => (
                      <tr key={supplier.id}>

                        <td>
                          {supplier.code || '-'}
                        </td>

                        <td>
                          <strong>
                            {supplier.name}
                          </strong>
                        </td>

                        <td>
                          {supplier.phone || '-'}
                        </td>

                        <td>
                          {supplier.email || '-'}
                        </td>

                        <td>
                          <span className="status-pill">
                            {supplier.is_active
                              ? 'ACTIVE'
                              : 'INACTIVE'}
                          </span>
                        </td>

                        <td>
                          <button
                            className="table-delete"
                            onClick={() =>
                              deleteRow(
                                'supplier',
                                supplier.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </td>

                      </tr>
                    )
                  )
                )}

              </tbody>

            </Table>

          </Section>


          <Section
            title="Purchase Orders"
            subtitle="Company-wise purchase transactions"
          >

            <Table>

              <thead>
                <tr>
                  <th>PO</th>
                  <th>COMPANY</th>
                  <th>SUPPLIER</th>
                  <th>DATE</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>

                {purchaseOrders.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    text="No purchase orders created yet."
                  />
                ) : (
                  purchaseOrders.map(
                    (po) => (
                      <tr key={po.id}>

                        <td>
                          <strong>
                            {po.po_number || `PO-${po.id}`}
                          </strong>
                        </td>

                        <td>
                          {po.company_name || '-'}
                        </td>

                        <td>
                          {po.supplier_name || '-'}
                        </td>

                        <td>
                          {po.order_date || '-'}
                        </td>

                        <td>
                          <span className="status-pill">
                            {po.status || 'DRAFT'}
                          </span>
                        </td>

                        <td>
                          <button
                            className="table-delete"
                            onClick={() =>
                              deleteRow(
                                'po',
                                po.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </td>

                      </tr>
                    )
                  )
                )}

              </tbody>

            </Table>

          </Section>


          <Section
            title="Goods Receipts"
            subtitle="Material receipt and stock entry"
          >

            <Table>

              <thead>
                <tr>
                  <th>GRN</th>
                  <th>COMPANY</th>
                  <th>SUPPLIER</th>
                  <th>LOT</th>
                  <th>QTY</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>

                {goodsReceipts.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    text="No goods receipts created yet."
                  />
                ) : (
                  goodsReceipts.map(
                    (grn) => (
                      <tr key={grn.id}>

                        <td>
                          {grn.grn_number || `GRN-${grn.id}`}
                        </td>

                        <td>
                          {grn.company_name || '-'}
                        </td>

                        <td>
                          {grn.supplier_name || '-'}
                        </td>

                        <td>
                          {grn.lot_number || '-'}
                        </td>

                        <td>
                          {grn.quantity || 0}
                        </td>

                        <td>
                          <button
                            className="table-delete"
                            onClick={() =>
                              deleteRow(
                                'grn',
                                grn.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </td>

                      </tr>
                    )
                  )
                )}

              </tbody>

            </Table>

          </Section>


          <Section
            title="Purchase Bills"
            subtitle="Supplier invoice and payable records"
          >

            <Table>

              <thead>
                <tr>
                  <th>BILL</th>
                  <th>COMPANY</th>
                  <th>SUPPLIER</th>
                  <th>TOTAL</th>
                  <th>OUTSTANDING</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>

                {purchaseBills.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    text="No purchase bills created yet."
                  />
                ) : (
                  purchaseBills.map(
                    (bill) => (
                      <tr key={bill.id}>

                        <td>
                          {bill.bill_number || `BILL-${bill.id}`}
                        </td>

                        <td>
                          {bill.company_name || '-'}
                        </td>

                        <td>
                          {bill.supplier_name || '-'}
                        </td>

                        <td>
                          ₹ {bill.total_amount || 0}
                        </td>

                        <td>
                          ₹ {bill.outstanding_amount || 0}
                        </td>

                        <td>
                          <button
                            className="table-delete"
                            onClick={() =>
                              deleteRow(
                                'bill',
                                bill.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </td>

                      </tr>
                    )
                  )
                )}

              </tbody>

            </Table>

          </Section>

        </>
      )}


      {/* ====================================================
          ALLOCATION
          ==================================================== */}

      {activeTab === 'allocation' && (
        <>

          <div className="sc-single-action">

            <button
              className="sc-primary"
              onClick={() =>
                setModal('allocation')
              }
            >
              + Create Internal Allocation
            </button>

          </div>


          <Section
            title="Internal Material Allocation"
            subtitle="Allocate common inventory to Company A or Company B"
          >

            <Table>

              <thead>
                <tr>
                  <th>COMPANY</th>
                  <th>MATERIAL</th>
                  <th>LOT</th>
                  <th>QUANTITY</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>

                {allocations.length === 0 ? (
                  <EmptyRow
                    colSpan={5}
                    text="No internal allocations created yet."
                  />
                ) : (
                  allocations.map(
                    (row) => (
                      <tr key={row.id}>

                        <td>
                          {row.company_name || '-'}
                        </td>

                        <td>
                          {row.item_name || '-'}
                        </td>

                        <td>
                          {row.lot_number || '-'}
                        </td>

                        <td>
                          {row.quantity || 0}
                        </td>

                        <td>
                          <button
                            className="table-delete"
                            onClick={() =>
                              deleteRow(
                                'allocation',
                                row.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </td>

                      </tr>
                    )
                  )
                )}

              </tbody>

            </Table>

          </Section>

        </>
      )}


      {/* ====================================================
          DISPATCH
          ==================================================== */}

      {activeTab === 'dispatch' && (
        <>

          <div className="sc-single-action">

            <button
              className="sc-primary"
              onClick={() =>
                setModal('dispatch')
              }
            >
              + Create Dispatch
            </button>

          </div>


          <Section
            title="Dispatches"
            subtitle="Company-wise finished goods dispatch"
          >

            <Table>

              <thead>
                <tr>
                  <th>DISPATCH</th>
                  <th>COMPANY</th>
                  <th>CUSTOMER</th>
                  <th>DATE</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>

                {dispatches.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    text="No dispatches created yet."
                  />
                ) : (
                  dispatches.map(
                    (row) => (
                      <tr key={row.id}>

                        <td>
                          {row.dispatch_number || `DSP-${row.id}`}
                        </td>

                        <td>
                          {row.company_name || '-'}
                        </td>

                        <td>
                          {row.customer_name || '-'}
                        </td>

                        <td>
                          {row.dispatch_date || '-'}
                        </td>

                        <td>
                          <span className="status-pill">
                            {row.status || 'DRAFT'}
                          </span>
                        </td>

                        <td>
                          <button
                            className="table-delete"
                            onClick={() =>
                              deleteRow(
                                'dispatch',
                                row.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </td>

                      </tr>
                    )
                  )
                )}

              </tbody>

            </Table>

          </Section>

        </>
      )}


      {/* ====================================================
          RETURNS
          ==================================================== */}

      {activeTab === 'returns' && (
        <>

          <div className="sc-action-grid">

            <button
              className="sc-action-card"
              onClick={() =>
                setModal('return')
              }
            >
              <strong>
                Create Sales Return
              </strong>

              <span>
                Customer → Company → Return
              </span>
            </button>


            <button
              className="sc-action-card"
              onClick={() =>
                setModal('recall')
              }
            >
              <strong>
                Create Product Recall
              </strong>

              <span>
                Batch → Recall → Return
              </span>
            </button>

          </div>


          <Section
            title="Sales Returns"
            subtitle="Returned material / finished goods"
          >

            <Table>

              <thead>
                <tr>
                  <th>RETURN</th>
                  <th>COMPANY</th>
                  <th>CUSTOMER</th>
                  <th>QTY</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>

                {salesReturns.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    text="No sales returns created yet."
                  />
                ) : (
                  salesReturns.map(
                    (row) => (
                      <tr key={row.id}>

                        <td>
                          {row.return_number || `RET-${row.id}`}
                        </td>

                        <td>
                          {row.company_name || '-'}
                        </td>

                        <td>
                          {row.customer_name || '-'}
                        </td>

                        <td>
                          {row.quantity || 0}
                        </td>

                        <td>
                          <span className="status-pill">
                            {row.status || 'PENDING'}
                          </span>
                        </td>

                        <td>
                          <button
                            className="table-delete"
                            onClick={() =>
                              deleteRow(
                                'return',
                                row.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </td>

                      </tr>
                    )
                  )
                )}

              </tbody>

            </Table>

          </Section>


          <Section
            title="Product Recall"
            subtitle="Batch-level recall records"
          >

            <Table>

              <thead>
                <tr>
                  <th>RECALL</th>
                  <th>COMPANY</th>
                  <th>BATCH</th>
                  <th>DATE</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>

                {recalls.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    text="No recalls created yet."
                  />
                ) : (
                  recalls.map(
                    (row) => (
                      <tr key={row.id}>

                        <td>
                          {row.recall_number || `REC-${row.id}`}
                        </td>

                        <td>
                          {row.company_name || '-'}
                        </td>

                        <td>
                          {row.batch_number || '-'}
                        </td>

                        <td>
                          {row.recall_date || '-'}
                        </td>

                        <td>
                          <span className="status-pill">
                            {row.status || 'OPEN'}
                          </span>
                        </td>

                        <td>
                          <button
                            className="table-delete"
                            onClick={() =>
                              deleteRow(
                                'recall',
                                row.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </td>

                      </tr>
                    )
                  )
                )}

              </tbody>

            </Table>

          </Section>

        </>
      )}


      {/* ====================================================
          MODALS
          ==================================================== */}

      {modal && (
        <div
          className="sc-modal-backdrop"
          onMouseDown={(event) => {

            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal()
            }

          }}
        >

          <div className="sc-modal">

            <div className="sc-modal-header">

              <div>

                <span>
                  CMHP PHARMA
                </span>

                <h2>
                  {modal === 'supplier' &&
                    'Add Supplier'}

                  {modal === 'po' &&
                    'Create Purchase Order'}

                  {modal === 'grn' &&
                    'Create Goods Receipt'}

                  {modal === 'bill' &&
                    'Create Purchase Bill'}

                  {modal === 'allocation' &&
                    'Internal Allocation'}

                  {modal === 'dispatch' &&
                    'Create Dispatch'}

                  {modal === 'return' &&
                    'Create Sales Return'}

                  {modal === 'recall' &&
                    'Create Product Recall'}
                </h2>

              </div>

              <button
                type="button"
                className="sc-close"
                onClick={closeModal}
              >
                ×
              </button>

            </div>


            {/* SUPPLIER */}

            {modal === 'supplier' && (
              <form
                className="sc-form"
                onSubmit={saveSupplier}
              >

                <Field label="Supplier Code">
                  <Input
                    value={supplierForm.code}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        code: e.target.value,
                      })
                    }
                    placeholder="SUP-001"
                  />
                </Field>


                <Field
                  label="Supplier Name"
                  required
                >
                  <Input
                    value={supplierForm.name}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        name: e.target.value,
                      })
                    }
                    required
                  />
                </Field>


                <Field label="GST Number">
                  <Input
                    value={supplierForm.gst_number}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        gst_number:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Phone">
                  <Input
                    value={supplierForm.phone}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        phone:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Email">
                  <Input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        email:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Address">
                  <textarea
                    value={supplierForm.address}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        address:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <FormButtons
                  onCancel={closeModal}
                />

              </form>
            )}


            {/* PURCHASE ORDER */}

            {modal === 'po' && (
              <form
                className="sc-form"
                onSubmit={savePurchaseOrder}
              >

                <Field label="PO Number">
                  <Input
                    value={poForm.po_number}
                    onChange={(e) =>
                      setPoForm({
                        ...poForm,
                        po_number:
                          e.target.value,
                      })
                    }
                    placeholder="PO-001"
                  />
                </Field>


                <Field
                  label="Company"
                  required
                >
                  <Select
                    value={poForm.company}
                    onChange={(e) =>
                      setPoForm({
                        ...poForm,
                        company:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <CompanyOptions />
                  </Select>
                </Field>


                <Field
                  label="Supplier"
                  required
                >
                  <Select
                    value={poForm.supplier}
                    onChange={(e) =>
                      setPoForm({
                        ...poForm,
                        supplier:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">
                      Select supplier
                    </option>

                    {suppliers.map(
                      (supplier) => (
                        <option
                          key={supplier.id}
                          value={supplier.id}
                        >
                          {supplier.name}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field label="Order Date">
                  <Input
                    type="date"
                    value={poForm.order_date}
                    onChange={(e) =>
                      setPoForm({
                        ...poForm,
                        order_date:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Expected Date">
                  <Input
                    type="date"
                    value={poForm.expected_date}
                    onChange={(e) =>
                      setPoForm({
                        ...poForm,
                        expected_date:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Notes">
                  <textarea
                    value={poForm.notes}
                    onChange={(e) =>
                      setPoForm({
                        ...poForm,
                        notes:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <FormButtons
                  onCancel={closeModal}
                />

              </form>
            )}


            {/* GOODS RECEIPT */}

            {modal === 'grn' && (
              <form
                className="sc-form"
                onSubmit={saveGoodsReceipt}
              >

                <Field label="GRN Number">
                  <Input
                    value={grnForm.grn_number}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        grn_number:
                          e.target.value,
                      })
                    }
                    placeholder="GRN-001"
                  />
                </Field>


                <Field
                  label="Company"
                  required
                >
                  <Select
                    value={grnForm.company}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        company:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <CompanyOptions />
                  </Select>
                </Field>


                <Field
                  label="Supplier"
                  required
                >
                  <Select
                    value={grnForm.supplier}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        supplier:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">
                      Select supplier
                    </option>

                    {suppliers.map(
                      (supplier) => (
                        <option
                          key={supplier.id}
                          value={supplier.id}
                        >
                          {supplier.name}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field label="Purchase Order">
                  <Select
                    value={grnForm.po}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        po:
                          e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Select PO
                    </option>

                    {purchaseOrders.map(
                      (po) => (
                        <option
                          key={po.id}
                          value={po.id}
                        >
                          {po.po_number ||
                            `PO-${po.id}`}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field
                  label="Material"
                  required
                >
                  <Select
                    value={grnForm.item}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        item:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">
                      Select material
                    </option>

                    {items.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.code} - {item.name}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field
                  label="Storage Location"
                  required
                >
                  <Select
                    value={grnForm.location}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        location:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">
                      Select location
                    </option>

                    {locations.map(
                      (location) => (
                        <option
                          key={location.id}
                          value={location.id}
                        >
                          {location.code} - {location.name}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field
                  label="Lot Number"
                  required
                >
                  <Input
                    value={grnForm.lot_number}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        lot_number:
                          e.target.value,
                      })
                    }
                    required
                  />
                </Field>


                <Field
                  label="Quantity"
                  required
                >
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={grnForm.quantity}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        quantity:
                          e.target.value,
                      })
                    }
                    required
                  />
                </Field>


                <Field label="Manufacture Date">
                  <Input
                    type="date"
                    value={
                      grnForm.manufacture_date
                    }
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        manufacture_date:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Expiry Date">
                  <Input
                    type="date"
                    value={
                      grnForm.expiry_date
                    }
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        expiry_date:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <FormButtons
                  onCancel={closeModal}
                />

              </form>
            )}


            {/* PURCHASE BILL */}

            {modal === 'bill' && (
              <form
                className="sc-form"
                onSubmit={savePurchaseBill}
              >

                <Field label="Bill Number">
                  <Input
                    value={billForm.bill_number}
                    onChange={(e) =>
                      setBillForm({
                        ...billForm,
                        bill_number:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field
                  label="Company"
                  required
                >
                  <Select
                    value={billForm.company}
                    onChange={(e) =>
                      setBillForm({
                        ...billForm,
                        company:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <CompanyOptions />
                  </Select>
                </Field>


                <Field
                  label="Supplier"
                  required
                >
                  <Select
                    value={billForm.supplier}
                    onChange={(e) =>
                      setBillForm({
                        ...billForm,
                        supplier:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">
                      Select supplier
                    </option>

                    {suppliers.map(
                      (supplier) => (
                        <option
                          key={supplier.id}
                          value={supplier.id}
                        >
                          {supplier.name}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field label="Bill Date">
                  <Input
                    type="date"
                    value={billForm.bill_date}
                    onChange={(e) =>
                      setBillForm({
                        ...billForm,
                        bill_date:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Total Amount">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      billForm.total_amount
                    }
                    onChange={(e) =>
                      setBillForm({
                        ...billForm,
                        total_amount:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Paid Amount">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      billForm.paid_amount
                    }
                    onChange={(e) =>
                      setBillForm({
                        ...billForm,
                        paid_amount:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <FormButtons
                  onCancel={closeModal}
                />

              </form>
            )}


            {/* INTERNAL ALLOCATION */}

            {modal === 'allocation' && (
              <form
                className="sc-form"
                onSubmit={saveAllocation}
              >

                <Field
                  label="Company"
                  required
                >
                  <Select
                    value={
                      allocationForm.company
                    }
                    onChange={(e) =>
                      setAllocationForm({
                        ...allocationForm,
                        company:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <CompanyOptions />
                  </Select>
                </Field>


                <Field
                  label="Material"
                  required
                >
                  <Select
                    value={
                      allocationForm.item
                    }
                    onChange={(e) =>
                      setAllocationForm({
                        ...allocationForm,
                        item:
                          e.target.value,
                        lot: '',
                      })
                    }
                    required
                  >
                    <option value="">
                      Select material
                    </option>

                    {items.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.code} - {item.name}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field
                  label="Lot"
                  required
                >
                  <Select
                    value={
                      allocationForm.lot
                    }
                    onChange={(e) =>
                      setAllocationForm({
                        ...allocationForm,
                        lot:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">
                      Select lot
                    </option>

                    {lots
                      .filter(
                        (lot) =>
                          !allocationForm.item ||
                          Number(lot.item) ===
                            Number(
                              allocationForm.item
                            )
                      )
                      .filter(
                        (lot) =>
                          Number(
                            lot.available_quantity
                          ) > 0
                      )
                      .map(
                        (lot) => (
                          <option
                            key={lot.id}
                            value={lot.id}
                          >
                            {lot.lot_number} — Available:{' '}
                            {lot.available_quantity}
                          </option>
                        )
                      )}
                  </Select>
                </Field>


                <Field
                  label="Quantity"
                  required
                >
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={
                      allocationForm.quantity
                    }
                    onChange={(e) =>
                      setAllocationForm({
                        ...allocationForm,
                        quantity:
                          e.target.value,
                      })
                    }
                    required
                  />
                </Field>


                <Field label="Reference">
                  <Input
                    value={
                      allocationForm.reference_note
                    }
                    onChange={(e) =>
                      setAllocationForm({
                        ...allocationForm,
                        reference_note:
                          e.target.value,
                      })
                    }
                    placeholder="Internal allocation"
                  />
                </Field>


                <FormButtons
                  onCancel={closeModal}
                />

              </form>
            )}


            {/* DISPATCH */}

            {modal === 'dispatch' && (
              <form
                className="sc-form"
                onSubmit={saveDispatch}
              >

                <Field label="Dispatch Number">
                  <Input
                    value={
                      dispatchForm.dispatch_number
                    }
                    onChange={(e) =>
                      setDispatchForm({
                        ...dispatchForm,
                        dispatch_number:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field
                  label="Company"
                  required
                >
                  <Select
                    value={
                      dispatchForm.company
                    }
                    onChange={(e) =>
                      setDispatchForm({
                        ...dispatchForm,
                        company:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <CompanyOptions />
                  </Select>
                </Field>


                <Field label="Customer">
                  <Select
                    value={
                      dispatchForm.customer
                    }
                    onChange={(e) =>
                      setDispatchForm({
                        ...dispatchForm,
                        customer:
                          e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Select customer
                    </option>

                    {customers.map(
                      (customer) => (
                        <option
                          key={customer.id}
                          value={customer.id}
                        >
                          {customer.name}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field label="Batch">
                  <Select
                    value={
                      dispatchForm.batch
                    }
                    onChange={(e) =>
                      setDispatchForm({
                        ...dispatchForm,
                        batch:
                          e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Select batch
                    </option>

                    {batches.map(
                      (batch) => (
                        <option
                          key={batch.id}
                          value={batch.id}
                        >
                          {batch.number ||
                            `BATCH-${batch.id}`}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field label="Invoice">
                  <Select
                    value={
                      dispatchForm.invoice
                    }
                    onChange={(e) =>
                      setDispatchForm({
                        ...dispatchForm,
                        invoice:
                          e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Select invoice
                    </option>

                    {invoices.map(
                      (invoice) => (
                        <option
                          key={invoice.id}
                          value={invoice.id}
                        >
                          {invoice.number ||
                            `INV-${invoice.id}`}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field label="Dispatch Date">
                  <Input
                    type="date"
                    value={
                      dispatchForm.dispatch_date
                    }
                    onChange={(e) =>
                      setDispatchForm({
                        ...dispatchForm,
                        dispatch_date:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Notes">
                  <textarea
                    value={
                      dispatchForm.notes
                    }
                    onChange={(e) =>
                      setDispatchForm({
                        ...dispatchForm,
                        notes:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <FormButtons
                  onCancel={closeModal}
                />

              </form>
            )}


            {/* RETURN */}

            {modal === 'return' && (
              <form
                className="sc-form"
                onSubmit={saveReturn}
              >

                <Field label="Return Number">
                  <Input
                    value={
                      returnForm.return_number
                    }
                    onChange={(e) =>
                      setReturnForm({
                        ...returnForm,
                        return_number:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field
                  label="Company"
                  required
                >
                  <Select
                    value={
                      returnForm.company
                    }
                    onChange={(e) =>
                      setReturnForm({
                        ...returnForm,
                        company:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <CompanyOptions />
                  </Select>
                </Field>


                <Field label="Customer">
                  <Select
                    value={
                      returnForm.customer
                    }
                    onChange={(e) =>
                      setReturnForm({
                        ...returnForm,
                        customer:
                          e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Select customer
                    </option>

                    {customers.map(
                      (customer) => (
                        <option
                          key={customer.id}
                          value={customer.id}
                        >
                          {customer.name}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field label="Invoice">
                  <Select
                    value={
                      returnForm.invoice
                    }
                    onChange={(e) =>
                      setReturnForm({
                        ...returnForm,
                        invoice:
                          e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Select invoice
                    </option>

                    {invoices.map(
                      (invoice) => (
                        <option
                          key={invoice.id}
                          value={invoice.id}
                        >
                          {invoice.number ||
                            `INV-${invoice.id}`}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field label="Return Date">
                  <Input
                    type="date"
                    value={
                      returnForm.return_date
                    }
                    onChange={(e) =>
                      setReturnForm({
                        ...returnForm,
                        return_date:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Quantity">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={
                      returnForm.quantity
                    }
                    onChange={(e) =>
                      setReturnForm({
                        ...returnForm,
                        quantity:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Reason">
                  <textarea
                    value={
                      returnForm.reason
                    }
                    onChange={(e) =>
                      setReturnForm({
                        ...returnForm,
                        reason:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <FormButtons
                  onCancel={closeModal}
                />

              </form>
            )}


            {/* RECALL */}

            {modal === 'recall' && (
              <form
                className="sc-form"
                onSubmit={saveRecall}
              >

                <Field label="Recall Number">
                  <Input
                    value={
                      recallForm.recall_number
                    }
                    onChange={(e) =>
                      setRecallForm({
                        ...recallForm,
                        recall_number:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field
                  label="Company"
                  required
                >
                  <Select
                    value={
                      recallForm.company
                    }
                    onChange={(e) =>
                      setRecallForm({
                        ...recallForm,
                        company:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <CompanyOptions />
                  </Select>
                </Field>


                <Field label="Batch">
                  <Select
                    value={
                      recallForm.batch
                    }
                    onChange={(e) =>
                      setRecallForm({
                        ...recallForm,
                        batch:
                          e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Select batch
                    </option>

                    {batches.map(
                      (batch) => (
                        <option
                          key={batch.id}
                          value={batch.id}
                        >
                          {batch.number ||
                            `BATCH-${batch.id}`}
                        </option>
                      )
                    )}
                  </Select>
                </Field>


                <Field label="Recall Date">
                  <Input
                    type="date"
                    value={
                      recallForm.recall_date
                    }
                    onChange={(e) =>
                      setRecallForm({
                        ...recallForm,
                        recall_date:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <Field label="Reason">
                  <textarea
                    value={
                      recallForm.reason
                    }
                    onChange={(e) =>
                      setRecallForm({
                        ...recallForm,
                        reason:
                          e.target.value,
                      })
                    }
                  />
                </Field>


                <FormButtons
                  onCancel={closeModal}
                />

              </form>
            )}

          </div>

        </div>
      )}

    </div>
  )
}


// ============================================================
// SMALL UI COMPONENTS
// ============================================================

function Section({
  title,
  subtitle,
  children,
}) {
  return (
    <section className="sc-section">

      <div className="sc-section-header">

        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

      </div>

      {children}

    </section>
  )
}


function Table({ children }) {
  return (
    <div className="sc-table-wrap">
      <table className="sc-table">
        {children}
      </table>
    </div>
  )
}


function EmptyRow({
  colSpan,
  text,
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="sc-empty"
      >
        {text}
      </td>
    </tr>
  )
}


function FormButtons({
  onCancel,
}) {
  return (
    <div className="sc-form-actions">

      <button
        type="button"
        className="sc-secondary"
        onClick={onCancel}
      >
        Cancel
      </button>

      <button
        type="submit"
        className="sc-primary"
      >
        Save
      </button>

    </div>
  )
}