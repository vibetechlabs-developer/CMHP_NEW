// Customer CSV import dialog: the file must have code and name columns, nothing is
// imported until the check passes, and a failed check shows the server's reasons.
// Synthetic data only.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CustomerImportModal from './CustomerImportModal'
import { commitCustomerImport, previewCustomerImport } from './customersService'

vi.mock('./customersService', () => ({
  previewCustomerImport: vi.fn(),
  commitCustomerImport: vi.fn(),
}))

function csvFile(text, name = 'customers.csv') {
  const file = new File([text], name, { type: 'text/csv' })
  file.text = async () => text
  return file
}

async function choose(text) {
  const input = screen.getByLabelText('Choose CSV file')
  await act(async () => {
    fireEvent.change(input, { target: { files: [csvFile(text)] } })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('CustomerImportModal', () => {
  it('asks for the required columns when they are missing and does not check the file', async () => {
    render(<CustomerImportModal realCompanyId={2} onClose={() => {}} onImported={() => {}} />)
    await choose('contact_person,phone\nAnne,123\n')
    expect(await screen.findByText(/needs these columns: code, name/)).toBeTruthy()
    expect(previewCustomerImport).not.toHaveBeenCalled()
  })

  it('shows the server result per row and keeps Import disabled while any row has a problem', async () => {
    previewCustomerImport.mockResolvedValue({
      summary: { total: 2, valid: 1, invalid: 1, eligible_for_commit: false },
      rows: [
        { row_number: 1, status: 'ok', code: 'C1', name: 'Synthetic One', errors: [] },
        { row_number: 2, status: 'error', code: 'C2', name: '', errors: ['name: This field may not be blank.'] },
      ],
    })
    render(<CustomerImportModal realCompanyId={2} onClose={() => {}} onImported={() => {}} />)
    await choose('code,name\nC1,Synthetic One\nC2,\n')
    fireEvent.click(await screen.findByRole('button', { name: 'Check file' }))
    expect(await screen.findByText('name: This field may not be blank.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Import 1 customer/ }).disabled).toBe(true)
    expect(commitCustomerImport).not.toHaveBeenCalled()
  })

  it('imports only after a clean check, sends the rows, and reports the created customers', async () => {
    previewCustomerImport.mockResolvedValue({
      summary: { total: 1, valid: 1, invalid: 0, eligible_for_commit: true },
      rows: [{ row_number: 1, status: 'ok', code: 'C1', name: 'Synthetic One', errors: [] }],
    })
    commitCustomerImport.mockResolvedValue({ created: 1, codes: ['C1'] })
    const onImported = vi.fn()
    render(<CustomerImportModal realCompanyId={2} onClose={() => {}} onImported={onImported} />)
    await choose('code,name\nC1,Synthetic One\n')
    fireEvent.click(await screen.findByRole('button', { name: 'Check file' }))
    fireEvent.click(await screen.findByRole('button', { name: /Import 1 customer/ }))
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(1))
    expect(commitCustomerImport).toHaveBeenCalledWith(2, [{ code: 'C1', name: 'Synthetic One' }])
  })

  it('keeps the dialog open and asks for a fresh check when the import is refused', async () => {
    previewCustomerImport.mockResolvedValue({
      summary: { total: 1, valid: 1, invalid: 0, eligible_for_commit: true },
      rows: [{ row_number: 1, status: 'ok', code: 'C1', name: 'Synthetic One', errors: [] }],
    })
    commitCustomerImport.mockRejectedValue({ response: { status: 400, headers: { 'content-type': 'application/json' }, data: { rows: ['Some rows are not valid. Nothing was imported.'] } } })
    const onImported = vi.fn()
    render(<CustomerImportModal realCompanyId={2} onClose={() => {}} onImported={onImported} />)
    await choose('code,name\nC1,Synthetic One\n')
    fireEvent.click(await screen.findByRole('button', { name: 'Check file' }))
    fireEvent.click(await screen.findByRole('button', { name: /Import 1 customer/ }))
    expect(await screen.findByText(/Nothing was imported/)).toBeTruthy()
    expect(onImported).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Check file' })).toBeTruthy()
  })
})
