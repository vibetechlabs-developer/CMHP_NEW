import { store } from '../../store/store'
import { delay } from '../../store/mockApi'

import {
  addInvoice,
  editInvoice,
  setInvoiceStatus,
} from '../../store/erpSlice'

import {
  getScopedCompanyId,
  enforceCompanyPayload,
} from '../../utils/companyScope'


function hydrateInvoice(
  inv,
  state
) {

  const company =
    state.companies.find(
      (c) =>
        c.id ===
        Number(inv.company)
    )


  const customer =
    state.customers.find(
      (c) =>
        c.id ===
        Number(inv.customer)
    )


  const lines =
    (inv.lines || []).map(
      (line) => {

        const product =
          state.products.find(
            (p) =>
              p.id ===
              Number(line.product)
          )


        return {
          ...line,
          product_name:
            product?.code || '',
        }

      }
    )


  return {

    ...inv,

    company_name:
      company?.name || '',

    customer_name:
      customer?.name || '',

    lines,

  }

}


function assertInvoiceCompany(
  id
) {

  const state =
    store.getState().erp

  const companyId =
    getScopedCompanyId()


  const invoice =
    state.invoices.find(
      (row) =>
        Number(row.id) ===
        Number(id)
    )


  if (
    !companyId ||
    !invoice ||
    Number(invoice.company) !==
      Number(companyId)
  ) {

    throw new Error(
      'This invoice does not belong to the active company.'
    )

  }


  return invoice

}


export const invoiceService = {


  getInvoices: () => {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    if (!companyId) {
      return delay([])
    }


    return delay(
      state.invoices

        .filter(
          (invoice) =>
            Number(
              invoice.company
            ) ===
            Number(
              companyId
            )
        )

        .map(
          (invoice) =>
            hydrateInvoice(
              invoice,
              state
            )
        )
    )

  },


  getInvoice: (
    id
  ) => {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    const invoice =
      state.invoices.find(
        (row) =>
          Number(row.id) ===
            Number(id) &&
          Number(
            row.company
          ) ===
            Number(companyId)
      )


    return delay(
      invoice
        ? hydrateInvoice(
            invoice,
            state
          )
        : null
    )

  },


  createInvoice: (
    payload
  ) => {

    /*
     * IMPORTANT:
     *
     * Ignore payload.company.
     * The active workspace decides company.
     */
    const scoped =
      enforceCompanyPayload(
        payload
      )


    store.dispatch(
      addInvoice({

        ...scoped,

        company:
          Number(
            scoped.company
          ),

        customer:
          Number(
            scoped.customer
          ),

        order:
          scoped.order
            ? Number(scoped.order)
            : null,

        batch:
          scoped.batch
            ? Number(scoped.batch)
            : null,

        lines:
          (
            scoped.lines || []
          ).map(
            (line) => ({
              ...line,

              product:
                line.product
                  ? Number(
                      line.product
                    )
                  : null,
            })
          ),

      })
    )


    return delay(null)

  },


  updateInvoice: (
    id,
    payload
  ) => {

    assertInvoiceCompany(
      id
    )


    const safePayload =
      {
        ...payload,
      }


    /*
     * Company can never be changed
     * from invoice edit screen.
     */
    delete safePayload.company


    store.dispatch(
      editInvoice({
        id,
        payload:
          safePayload,
      })
    )


    return delay(null)

  },


  markPaid: (
    id,
    payload
  ) => {

    assertInvoiceCompany(
      id
    )


    store.dispatch(
      setInvoiceStatus({
        id,
        status:
          'PAID',
        paid_on:
          payload.paid_on,
      })
    )


    return delay(null)

  },


  cancelInvoice: (
    id
  ) => {

    assertInvoiceCompany(
      id
    )


    store.dispatch(
      setInvoiceStatus({
        id,
        status:
          'CANCELLED',
      })
    )


    return delay(null)

  },

}