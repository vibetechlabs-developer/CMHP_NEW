// Deleting a draft sales order from /orders: safe error text only, the row stays
// until the backend confirms, one attempt per confirmation, and a 409 never
// retries by itself. Synthetic data only.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SalesOrdersPanel from './SalesOrdersPanel'
import { deleteSalesOrder, listSalesOrders } from './salesOrdersService'

vi.mock('../../hooks/usePermissions', () => ({
  default: () => ({
    loading: false,
    error: null,
    realCompanyId: 2,
    hasPermission: () => true,
    permissions: [],
  }),
}))
vi.mock('../../hooks/useAuth', () => ({
  default: () => ({ user: { id: 1, username: 'nishita' } }),
}))
vi.mock('./SalesOrderFormModal', () => ({ default: () => null }))
vi.mock('./salesOrdersService', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listSalesOrders: vi.fn(), deleteSalesOrder: vi.fn() }
})

const DRAFT = {
  id: 5,
  reference: 'SO-SYNTH-1',
  status: 'DRAFT',
  version: 3,
  customer_name: 'Synthetic Customer',
  customer_code: 'SYN',
  order_date: '2026-10-02',
  lines: [],
  line_count: 0,
  subtotal: '0.00',
  currency: 'INR',
}

function rowsResponse(rows) {
  return { count: rows.length, results: rows }
}

function htmlError() {
  return {
    response: {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: '<!DOCTYPE html><html><body><h1>Server Error</h1><pre>Traceback (most recent call last) SECRET_KEY=abc</pre></body></html>',
    },
  }
}

function jsonError(status, detail) {
  return {
    response: { status, headers: { 'content-type': 'application/json' }, data: { detail } },
  }
}

async function openDeleteDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
  return screen.findByRole('button', { name: 'Delete order' })
}

beforeEach(() => {
  listSalesOrders.mockResolvedValue(rowsResponse([DRAFT]))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('deleting a draft sales order', () => {
  it('shows the confirmation with the order reference and the permanent-action note', async () => {
    render(<SalesOrdersPanel />)
    await openDeleteDialog()
    expect(screen.getByText('Delete draft order?')).toBeTruthy()
    // The reference appears in the row and in the dialog; check the dialog copy.
    expect(screen.getAllByText('SO-SYNTH-1').length).toBe(2)
    expect(screen.getByText(/permanently removes the draft order/)).toBeTruthy()
  })

  it('never shows raw HTML, a debug page or a settings dump from a 500 response', async () => {
    deleteSalesOrder.mockRejectedValue(htmlError())
    const { container } = render(<SalesOrdersPanel />)
    fireEvent.click(await openDeleteDialog())
    expect(await screen.findByText("We couldn't delete this order. Please try again. If the problem continues, contact your administrator.")).toBeTruthy()
    const text = container.textContent || ''
    expect(text).not.toMatch(/Traceback|SECRET_KEY|<html|<body|DOCTYPE/i)
  })

  it('keeps the row when the delete fails', async () => {
    deleteSalesOrder.mockRejectedValue(htmlError())
    render(<SalesOrdersPanel />)
    fireEvent.click(await openDeleteDialog())
    await screen.findByText(/We couldn't delete this order/)
    expect(screen.getByText('SO-SYNTH-1')).toBeTruthy()
  })

  it('shows a structured business refusal from the server and keeps the order', async () => {
    // The server's real shape for a business refusal: a list under "detail".
    deleteSalesOrder.mockRejectedValue(
      jsonError(400, ['This order has store preparation records, so it cannot be deleted. Store preparation is kept as recorded by the store team.'])
    )
    render(<SalesOrdersPanel />)
    fireEvent.click(await openDeleteDialog())
    expect(await screen.findByText(/has store preparation records, so it cannot be deleted/)).toBeTruthy()
    expect(screen.getByText('SO-SYNTH-1')).toBeTruthy()
  })

  it('removes the row only after a confirmed backend success', async () => {
    deleteSalesOrder.mockResolvedValue(undefined)
    listSalesOrders.mockResolvedValueOnce(rowsResponse([DRAFT])).mockResolvedValue(rowsResponse([]))
    render(<SalesOrdersPanel />)
    fireEvent.click(await openDeleteDialog())
    await waitFor(() => expect(screen.queryByText('SO-SYNTH-1')).toBeNull())
    expect(deleteSalesOrder).toHaveBeenCalledTimes(1)
  })

  it('prevents duplicate submissions while a delete is in flight', async () => {
    let finish
    deleteSalesOrder.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    render(<SalesOrdersPanel />)
    const confirm = await openDeleteDialog()
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await act(async () => {
      finish()
    })
    expect(deleteSalesOrder).toHaveBeenCalledTimes(1)
  })

  it('a 409 explains the change, reloads the list and never retries the delete automatically', async () => {
    deleteSalesOrder.mockRejectedValue(jsonError(409, 'changed'))
    render(<SalesOrdersPanel />)
    fireEvent.click(await openDeleteDialog())
    expect(await screen.findByText(/changed since it was loaded/)).toBeTruthy()
    await waitFor(() => expect(listSalesOrders.mock.calls.length).toBeGreaterThan(1))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(deleteSalesOrder).toHaveBeenCalledTimes(1)
  })
})
