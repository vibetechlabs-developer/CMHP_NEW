import { expect, it } from 'vitest'
import reducer, { mergeApiOrders } from './erpSlice'

it('does not carry demo production flags into a persisted order with the same ID', () => {
  const seed = reducer(undefined, { type: 'test/init' })
  const demo = { id: 39, number: 'ORD-2026-039', company: 2, production_status: 'Completed', is_dispatched: true }
  const actual = { id: 39, number: 'SO-REAL-39', company: 2, company_id: 2, production_status: 'In Planning' }
  const state = {
    ...seed,
    orders: [demo],
    byCompany: { ...seed.byCompany, cmhp: { ...seed.byCompany?.cmhp, orders: [demo] } },
  }

  const updated = reducer(state, mergeApiOrders({ companyId: 2, orders: [actual] }))
  expect(updated.orders.find((order) => order.id === 39)).toEqual(actual)
  expect(updated.byCompany.cmhp.orders.find((order) => order.id === 39)).toEqual(actual)
})
