import { describe, expect, it } from 'vitest'
import { isQaDemoRecord } from './qaDemoRecords'

describe('QA demo records', () => {
  it.each([
    { productName: 'Demo Antacid Suspension', productCode: 'TST/004' },
    { productName: 'test', productCode: 'hj' },
    { orderReference: 'SO-DEMO-TAB-01' },
  ])('hides identified demo data', (record) => {
    expect(isQaDemoRecord(record)).toBe(true)
  })

  it.each([
    { productName: 'CURE RENOL', productCode: 'HML/05', orderReference: 'SO-20261027-B097546E20' },
    { productName: 'Test01', productCode: 'T01' },
    { productName: 'Order with TST code', productCode: 'TST/008' },
  ])('keeps records without a known demo identity', (record) => {
    expect(isQaDemoRecord(record)).toBe(false)
  })
})
