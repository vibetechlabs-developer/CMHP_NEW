// Shared error text: HTML and long bodies are never shown; JSON business
// messages are. Synthetic responses only.
import { describe, expect, it } from 'vitest'

import { getErrorMessage } from './errors'
import { deleteOrderErrorMessage } from '../features/operations/salesOrdersService'

const SAFE = 'Something went wrong. Please try again. If the problem continues, contact your administrator.'

describe('getErrorMessage with markup bodies', () => {
  it('replaces an HTML page with the safe fallback', () => {
    expect(getErrorMessage({ response: { status: 500, data: '<!DOCTYPE html><html><body>Traceback</body></html>' } })).toBe(SAFE)
  })

  it('replaces a long text dump with the safe fallback', () => {
    expect(getErrorMessage({ response: { status: 500, data: 'x'.repeat(500) } })).toBe(SAFE)
  })

  it('still shows a short plain-text message', () => {
    expect(getErrorMessage({ response: { status: 400, data: 'Plain message.' } })).toBe('Plain message.')
  })
})

describe('deleteOrderErrorMessage', () => {
  const generic = "We couldn't delete this order. Please try again. If the problem continues, contact your administrator."

  it('uses the generic wording for an HTML 500', () => {
    expect(deleteOrderErrorMessage({ response: { status: 500, headers: { 'content-type': 'text/html' }, data: '<html>boom</html>' } })).toBe(generic)
  })

  it('uses the generic wording for a 5xx with a JSON body that is not a business message', () => {
    expect(deleteOrderErrorMessage({ response: { status: 500, headers: { 'content-type': 'application/json' }, data: { detail: 'x'.repeat(400) } } })).toBe(generic)
  })

  it('shows the business message when the server sends the DRF list form {"detail": [message]}', () => {
    expect(deleteOrderErrorMessage({ response: { status: 400, headers: { 'content-type': 'application/json' }, data: { detail: ['This order has batch plans. Remove them before deleting the order.'] } } })).toBe('This order has batch plans. Remove them before deleting the order.')
  })

  it('shows the business message from a JSON 400', () => {
    expect(deleteOrderErrorMessage({ response: { status: 400, headers: { 'content-type': 'application/json' }, data: { detail: 'Only a draft sales order can be deleted.' } } })).toBe('Only a draft sales order can be deleted.')
  })

  it('never exposes permission codes on a 403', () => {
    const text = deleteOrderErrorMessage({ response: { status: 403, headers: { 'content-type': 'application/json' }, data: { detail: 'The following permission(s) are required: sales_orders.delete.' } } })
    expect(text).not.toMatch(/sales_orders\.delete/)
  })

  it('explains a 409 without retrying', () => {
    expect(deleteOrderErrorMessage({ response: { status: 409 } })).toMatch(/changed since it was loaded/)
  })
})
