// Access-gating tests for the Organization Setup entry point. The real
// requirement: an authorized administrator reaches the setup screens even
// with zero company/store membership, while an ordinary user sees a plain
// access-denied state, never the setup forms themselves - gated purely on
// the real `capabilities.can_manage_organization_setup` flag, never on
// `user.profile.role`/`user.is_superuser`.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import OrganizationSetupPage from './OrganizationSetupPage'

afterEach(cleanup)

vi.mock('../../hooks/useAuth', () => ({ default: vi.fn() }))
vi.mock('./tabs/OrgCompaniesTab', () => ({ default: () => <div>companies-tab-stub</div> }))
vi.mock('./tabs/OrgStoresTab', () => ({ default: () => <div>stores-tab-stub</div> }))
vi.mock('./tabs/OrgCompanyAccessTab', () => ({ default: () => <div>company-access-tab-stub</div> }))
vi.mock('./tabs/OrgStoreAccessTab', () => ({ default: () => <div>store-access-tab-stub</div> }))
vi.mock('./tabs/OrgUnitsTab', () => ({ default: () => <div>units-tab-stub</div> }))
vi.mock('./tabs/OrgConfirmationPolicyTab', () => ({ default: () => <div>policy-tab-stub</div> }))

import useAuth from '../../hooks/useAuth'

describe('OrganizationSetupPage access gating', () => {
  it('denies an ordinary user with no capability, without rendering any setup form', () => {
    useAuth.mockReturnValue({ user: { id: 1, capabilities: {} } })
    render(<OrganizationSetupPage />)
    expect(screen.getByText(/Access unavailable/)).toBeTruthy()
    expect(screen.queryByText('companies-tab-stub')).toBeNull()
  })

  it('denies a business admin holding every operational permission but not the real capability', () => {
    // The whole point of this capability: holding operational permissions
    // elsewhere is not the same as being an active superuser.
    useAuth.mockReturnValue({ user: { id: 2, is_superuser: false, profile: { role: 'SUPER_ADMIN' }, capabilities: { can_manage_material_catalog: true } } })
    render(<OrganizationSetupPage />)
    expect(screen.getByText(/Access unavailable/)).toBeTruthy()
  })

  it('reaches the setup screens for an authorized user, with zero workspace/company context required', () => {
    // No `profile.real_companies`, no `profile.companies` - this user has
    // no workspace at all, which must not block access.
    useAuth.mockReturnValue({ user: { id: 3, capabilities: { can_manage_organization_setup: true } } })
    render(<OrganizationSetupPage />)
    expect(screen.queryByText(/Access unavailable/)).toBeNull()
    expect(screen.getByText('Organization Setup')).toBeTruthy()
    expect(screen.getByText('companies-tab-stub')).toBeTruthy()
  })

  it('switches tabs without losing the authorized gate', () => {
    useAuth.mockReturnValue({ user: { id: 3, capabilities: { can_manage_organization_setup: true } } })
    render(<OrganizationSetupPage />)
    fireEvent.click(screen.getByRole('tab', { name: 'Units of measure' }))
    expect(screen.getByText('units-tab-stub')).toBeTruthy()
    expect(screen.queryByText('companies-tab-stub')).toBeNull()
  })
})
