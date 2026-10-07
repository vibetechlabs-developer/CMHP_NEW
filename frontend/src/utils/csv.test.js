import { describe, expect, it } from 'vitest'

import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('reads headers and rows, handling CRLF and a BOM', () => {
    const { headers, rows } = parseCsv('﻿Code,Name\r\nC1,Synthetic One\r\nC2,Synthetic Two\r\n')
    expect(headers).toEqual(['code', 'name'])
    expect(rows).toEqual([{ code: 'C1', name: 'Synthetic One' }, { code: 'C2', name: 'Synthetic Two' }])
  })

  it('keeps commas and doubled quotes inside quoted fields', () => {
    const { rows } = parseCsv('code,name,notes\nC3,"Synthetic, Three","He said ""hi"""\n')
    expect(rows[0]).toEqual({ code: 'C3', name: 'Synthetic, Three', notes: 'He said "hi"' })
  })

  it('skips blank lines and returns nothing for an empty file', () => {
    expect(parseCsv('code,name\n\n\nC4,Synthetic Four\n').rows).toHaveLength(1)
    expect(parseCsv('   \n')).toEqual({ headers: [], rows: [] })
  })
})
