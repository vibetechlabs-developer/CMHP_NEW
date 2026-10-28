// The permission editor must preselect exactly what the role already
// holds (preserving anything the admin has not intentionally touched),
// and must send the server a COMPLETE desired set on save, matching the
// backend's full-replace PUT semantics - never a delta.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import RolePermissionEditor from './RolePermissionEditor'

afterEach(cleanup)

const CATALOG = [
  { code: 'sales_orders.view', name: 'View sales orders', module: 'sales_orders', description: '', is_active: true },
  { code: 'sales_orders.create', name: 'Create sales orders', module: 'sales_orders', description: '', is_active: true },
  { code: 'sales_orders.confirm', name: 'Confirm sales orders', module: 'sales_orders', description: '', is_active: true },
]

const ROLE = {
  id: 1,
  code: 'MANAGER',
  permissions: [
    { code: 'sales_orders.view', name: 'View sales orders', module: 'sales_orders', is_active: true },
  ],
}

describe('RolePermissionEditor', () => {
  it('preselects exactly the role’s current permissions from the catalog', () => {
    render(<RolePermissionEditor role={ROLE} allPermissions={CATALOG} onSave={vi.fn()} busy={false} />)
    expect(screen.getByRole('checkbox', { name: /View sales orders/ }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Create sales orders/ }).checked).toBe(false)
  })

  it('save disabled until the selection actually changes', () => {
    render(<RolePermissionEditor role={ROLE} allPermissions={CATALOG} onSave={vi.fn()} busy={false} />)
    expect(screen.getByRole('button', { name: 'Save permissions' }).disabled).toBe(true)
  })

  it('sends the COMPLETE desired code set on save, not just the newly toggled code', async () => {
    const onSave = vi.fn()
    render(<RolePermissionEditor role={ROLE} allPermissions={CATALOG} onSave={onSave} busy={false} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Create sales orders/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    expect(onSave).toHaveBeenCalledWith(['sales_orders.create', 'sales_orders.view'])
  })

  it('unchecking the only pre-existing permission sends an empty set, not the untouched original', async () => {
    const onSave = vi.fn()
    render(<RolePermissionEditor role={ROLE} allPermissions={CATALOG} onSave={onSave} busy={false} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /View sales orders/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    expect(onSave).toHaveBeenCalledWith([])
  })

  it('warns about a deactivated permission still assigned, which saving would drop', () => {
    const roleWithInactive = {
      id: 2,
      code: 'LEGACY',
      permissions: [{ code: 'sales_orders.old_code', name: 'Old', module: 'sales_orders', is_active: false }],
    }
    render(<RolePermissionEditor role={roleWithInactive} allPermissions={CATALOG} onSave={vi.fn()} busy={false} />)
    expect(screen.getByText(/deactivated permission/)).toBeTruthy()
    expect(screen.getByText(/sales_orders.old_code/)).toBeTruthy()
  })

  it('resets its working selection when switching to a different role', () => {
    const { rerender } = render(<RolePermissionEditor role={ROLE} allPermissions={CATALOG} onSave={vi.fn()} busy={false} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Create sales orders/ }))
    expect(screen.getByRole('checkbox', { name: /Create sales orders/ }).checked).toBe(true)

    const otherRole = { id: 99, code: 'OTHER', permissions: [] }
    rerender(<RolePermissionEditor role={otherRole} allPermissions={CATALOG} onSave={vi.fn()} busy={false} />)
    expect(screen.getByRole('checkbox', { name: /Create sales orders/ }).checked).toBe(false)
  })
})
