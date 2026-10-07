// Mirrors backend ACTION_ROLE_MATRIX (inventory/permissions.py) for UI gating only.
// The backend is always the source of truth / enforcement point.
const MATRIX = {
  SUPER_ADMIN: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
  MANAGEMENT: ['view', 'export'],
  STORES_MANAGER: ['view', 'create', 'edit', 'approve', 'export'],
  STORES_USER: ['view', 'create', 'export'],
  VIEWER: ['view'],
}

export function can(role, capability) {
  return (MATRIX[role] || []).includes(capability)
}