// Regression test for a real bug: picking a workspace card here used to write
// straight to localStorage (bypassing WorkspaceContext's own React state), so
// the very next screen - MainLayout's sidebar, the workspace logo, every real
// API call's scoped company id - kept reading the OLD `activeWorkspace` (null,
// right after a fresh login) even though the URL had already moved to
// /dashboard. Reported symptom: pick "Company A", land on /dashboard, but the
// sidebar still shows the Common Inventory items and the wrong/no logo.
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import WorkspaceSelection from './WorkspaceSelection'
import { WorkspaceProvider } from '../../context/WorkspaceContext'
import useWorkspace from '../../hooks/useWorkspace'
import { store } from '../../store/store'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../hooks/useAuth', () => ({
  default: () => ({ user: auth.user, logout: vi.fn() }),
}))
vi.mock('../operations/realDataSync', () => ({ syncRealOperationsData: vi.fn() }))

function ActiveWorkspaceProbe() {
  const { activeWorkspace } = useWorkspace()
  return <div data-testid="probe">{activeWorkspace ?? 'NONE'}</div>
}

function renderAt(initialPath) {
  return render(
    <Provider store={store}>
      <WorkspaceProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/workspace-select" element={<WorkspaceSelection />} />
            <Route path="/dashboard" element={<ActiveWorkspaceProbe />} />
            <Route path="/inventory" element={<ActiveWorkspaceProbe />} />
          </Routes>
        </MemoryRouter>
      </WorkspaceProvider>
    </Provider>
  )
}

describe('WorkspaceSelection - picking a card updates the real workspace context', () => {
  beforeEach(() => {
    localStorage.clear()
    auth.user = {
      id: 1,
      username: 'nishita',
      is_superuser: true,
      profile: {
        companies: [1, 2],
        real_companies: [
          { id: 2, code: 'CMHP', legal_name: 'CMHP', display_name: 'CMHP' },
          { id: 3, code: 'TEJ BIOCARE', legal_name: 'Tej Biocare', display_name: 'Tej Biocare' },
        ],
        can_access_common_inventory: true,
      },
    }
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('sets the real company id in context (not just localStorage) when a company card is picked', () => {
    renderAt('/workspace-select')

    fireEvent.click(screen.getByText('CMHP'))

    // The navigated-to screen must see the SAME value WorkspaceContext now
    // holds - proving the click updated React state, not only localStorage.
    expect(screen.getByTestId('probe').textContent).toBe('company_a')
  })

  it('sets the Common Inventory workspace in context when that card is picked', () => {
    renderAt('/workspace-select')

    fireEvent.click(screen.getByText('Common Inventory'))

    expect(screen.getByTestId('probe').textContent).toBe('common_inventory')
  })
})
