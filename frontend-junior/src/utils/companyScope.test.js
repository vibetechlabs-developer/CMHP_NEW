// Regression test for a real bug: getRealScopedCompanyId used to translate
// the scoped company id a second time, as if it were still a mock slot
// number (1/2), after getActiveCompanyId had already resolved it to the
// REAL backend company id. For any account with exactly one real company
// whose real id isn't 1 (the common case - every account here maps onto
// "Company A" with some real id, e.g. 2), that second translation indexed
// past the end of a one-item `real_companies` array and returned null -
// "No real company is linked to the current workspace" - even though the
// company was correctly resolved one step earlier.
import { beforeEach, describe, expect, it } from 'vitest'

import { getRealScopedCompanyId, getScopedCompanyId } from './companyScope'
import { clearSelectedWorkspace, setSelectedWorkspace, WORKSPACES } from './workspace'

function singleCompanyUser() {
  // Exactly Fenil's real situation: one active membership, in CMHP (real
  // backend id 2), a non-superuser account.
  return {
    id: 42,
    username: 'fenil',
    is_superuser: false,
    profile: {
      companies: [1], // the mock bridge only ever fills slot 1 when there is one real company
      real_companies: [{ id: 2, code: 'CMHP', legal_name: 'CMHP', display_name: 'CMHP' }],
    },
  }
}

describe('getRealScopedCompanyId - single real company account', () => {
  beforeEach(() => {
    clearSelectedWorkspace()
  })

  it('resolves to the real backend company id, not null', () => {
    const user = singleCompanyUser()
    expect(getScopedCompanyId(user)).toBe(2)
    expect(getRealScopedCompanyId(user)).toBe(2)
  })

  it('agrees with getScopedCompanyId for a two-company superuser too', () => {
    const superuser = {
      id: 1,
      username: 'nishita',
      is_superuser: true,
      profile: {
        companies: [1, 2],
        real_companies: [
          { id: 2, code: 'CMHP', legal_name: 'CMHP', display_name: 'CMHP' },
          { id: 3, code: 'TEJ BIOCARE', legal_name: 'Tej Biocare', display_name: 'Tej Biocare' },
        ],
      },
    }
    setSelectedWorkspace(WORKSPACES.COMPANY_B)
    expect(getScopedCompanyId(superuser)).toBe(3)
    expect(getRealScopedCompanyId(superuser)).toBe(3)
  })
})
