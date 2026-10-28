// getAvailableWorkspaces: the "Company A"/"Company B" workspace cards must show
// the signed-in user's REAL company name (from authService.js's company bridge,
// user.profile.real_companies, same ascending-real-id order the A/B slot mapping
// itself uses) instead of the generic slot label - and must still fall back to
// the generic label when there is no real company at that position.
//
// Ported from frontend/src/utils/workspace.test.js - same real
// workspace.js implementation, now running in frontend-junior.
import { describe, expect, it } from 'vitest'

import { getAvailableWorkspaces, WORKSPACES } from './workspace'

function baseUser(overrides = {}) {
  return {
    is_superuser: true,
    profile: {
      companies: [1, 2],
      real_companies: [],
      can_access_common_inventory: false,
    },
    ...overrides,
  }
}

describe('getAvailableWorkspaces - real company names', () => {
  it('shows each real company display_name in place of the generic slot label', () => {
    const user = baseUser({
      profile: {
        companies: [1, 2],
        real_companies: [
          { id: 2, code: 'CMHP', legal_name: 'CMHP', display_name: 'CMHP' },
          { id: 3, code: 'TEJ BIOCARE', legal_name: 'Tej Biocare', display_name: 'Tej Biocare' },
        ],
      },
    })

    const options = getAvailableWorkspaces(user)
    const companyA = options.find((o) => o.id === WORKSPACES.COMPANY_A)
    const companyB = options.find((o) => o.id === WORKSPACES.COMPANY_B)

    expect(companyA.name).toBe('CMHP')
    expect(companyA.description).toContain('CMHP')
    expect(companyB.name).toBe('Tej Biocare')
    expect(companyB.description).toContain('Tej Biocare')
  })

  it('falls back to legal_name when display_name is blank', () => {
    const user = baseUser({
      profile: {
        companies: [1],
        real_companies: [{ id: 2, code: 'ACME', legal_name: 'Acme Pharma Pvt Ltd', display_name: '' }],
      },
    })

    const options = getAvailableWorkspaces(user)
    const companyA = options.find((o) => o.id === WORKSPACES.COMPANY_A)

    expect(companyA.name).toBe('Acme Pharma Pvt Ltd')
  })

  it('falls back to the generic "Company A"/"Company B" label when no real company bridge exists', () => {
    const user = baseUser({
      profile: { companies: [1, 2], real_companies: [] },
    })

    const options = getAvailableWorkspaces(user)
    const companyA = options.find((o) => o.id === WORKSPACES.COMPANY_A)
    const companyB = options.find((o) => o.id === WORKSPACES.COMPANY_B)

    expect(companyA.name).toBe('Company A')
    expect(companyB.name).toBe('Company B')
  })

  it('never shows the Company B real name on the Company A slot, or vice versa', () => {
    const user = baseUser({
      profile: {
        companies: [1, 2],
        real_companies: [
          { id: 2, code: 'CMHP', legal_name: 'CMHP', display_name: 'CMHP' },
          { id: 3, code: 'TEJ', legal_name: 'Tej Biocare', display_name: 'Tej Biocare' },
        ],
      },
    })

    const options = getAvailableWorkspaces(user)
    const names = options.map((o) => o.name)

    expect(names).toContain('CMHP')
    expect(names).toContain('Tej Biocare')
    expect(options.find((o) => o.id === WORKSPACES.COMPANY_A).name).not.toBe('Tej Biocare')
    expect(options.find((o) => o.id === WORKSPACES.COMPANY_B).name).not.toBe('CMHP')
  })
})
