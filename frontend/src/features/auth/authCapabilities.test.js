// The server's read-only capability hints are carried into the session user and
// default to empty. They never create a permission on the client. Synthetic data only.
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
