// The server's read-only capability hints are carried into the session user and
// default to empty. They never create a permission on the client. Synthetic data only.
//
// Ported from frontend/src/features/auth/authCapabilities.test.js - same
// real authService.js implementation, now running in frontend-junior.
import { describe, expect, it } from 'vitest'

import { createSessionUser } from './authService'

describe('session user capabilities', () => {
  it('carries the server capability hints through unchanged', () => {
    const user = createSessionUser({ id: 1, username: 'synthetic', capabilities: { can_manage_material_catalog: true } })
    expect(user.capabilities).toEqual({ can_manage_material_catalog: true })
  })

  it('defaults to an empty object when the server sends none', () => {
    const user = createSessionUser({ id: 2, username: 'synthetic-two' })
    expect(user.capabilities).toEqual({})
    expect(user.capabilities.can_manage_material_catalog).toBeUndefined()
  })
})

describe('can_access_common_inventory - real evidence only, never a mock label', () => {
  it('is false when there is no mock match and no real store access and no real superuser evidence', () => {
    const user = createSessionUser({ id: 3, username: 'synthetic-three' }, null, null, false, false)
    expect(user.profile.can_access_common_inventory).toBe(false)
  })

  it('is true from real store membership evidence alone, with no mock match at all', () => {
    const user = createSessionUser({ id: 4, username: 'synthetic-four' }, null, null, false, true)
    expect(user.profile.can_access_common_inventory).toBe(true)
  })

  it('is true from real superuser evidence alone, with no mock match at all', () => {
    const user = createSessionUser({ id: 5, username: 'synthetic-five' }, null, null, true, false)
    expect(user.profile.can_access_common_inventory).toBe(true)
  })

  it('ignores a mock match whose own can_access_common_inventory flag is true, when there is no real evidence', () => {
    const mockMatch = { role: 'VIEWER', can_access_common_inventory: true }
    const user = createSessionUser({ id: 6, username: 'synthetic-six' }, mockMatch, null, false, false)
    expect(user.profile.can_access_common_inventory).toBe(false)
  })
})
