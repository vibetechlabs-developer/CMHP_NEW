// Smoke test: every designed page enabled for the "Coming soon" sidebar modules
// renders without throwing (inside the real Redux store and a router).
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { store } from '../store/store'
import Quality from '../features/quality/Quality'
import Invoice from '../features/invoice/Invoice'
import SupplyChain from '../features/supplyChain/SupplyChain'
import HrDashboard from '../features/hrms/HrDashboard'

vi.mock('../hooks/useAuth', () => ({
  default: () => ({ user: { id: 1, username: 'tester', first_name: 'Test', profile: { role: 'SUPER_ADMIN' } }, isAuthenticated: true }),
}))

afterEach(() => {
  cleanup()
})

const PAGES = [
  ['Quality', Quality],
  ['Invoice', Invoice],
  ['SupplyChain', SupplyChain],
  ['HrDashboard', HrDashboard],
]

describe('demo module pages', () => {
  for (const [name, Page] of PAGES) {
    it(`${name} renders`, () => {
      const { container } = render(
        <Provider store={store}>
          <MemoryRouter>
            <Page />
          </MemoryRouter>
        </Provider>
      )
      expect(container.innerHTML.length).toBeGreaterThan(0)
    })
  }
})
