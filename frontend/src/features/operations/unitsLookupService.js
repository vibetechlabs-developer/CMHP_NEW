// Real apps.catalog UnitOfMeasure lookup - shared/global, NOT company-
// scoped (GET /api/v1/units/). Required for the Product create form's
// sales_uom picker. Gated by apps.catalog.permissions.CanReadSharedCatalog:
// an active superuser, OR a user holding `shared_catalog.view` in at
// least one active STORE (a different permission axis than the company-
// scoped permissions the rest of this feature uses - company membership/
// role is never consulted for this one check). A caller lacking it gets
// a real 403 with that exact message; this function does not pre-check
// or swallow that - it is the caller's (SalesUnitSelect's) job to show
// it plainly and never substitute a hardcoded unit list.
import api from '../../api/axios'

export async function searchActiveUnits(term) {
  const response = await api.get('/v1/units/', {
    params: { search: term || undefined, is_active: true, page_size: 20 },
  })
  return (response.data.results || []).map((unit) => ({
    id: unit.id,
    label: `${unit.name} (${unit.code})`,
    meta: unit.dimension,
  }))
}

// Units for batch planning pickers (packing content unit, batch size unit).
// Scoped to the company and gated by batch_plans.view - so a planner does not
// need shared_catalog.view or any catalog administration permission.
export async function listPlanningUnits(companyId, term = '') {
  const response = await api.get(`/v1/companies/${companyId}/batch-plans/planning-units/`)
  const needle = (term || '').trim().toLowerCase()
  return (response.data.results || [])
    .filter((unit) => !needle || unit.code.toLowerCase().includes(needle) || unit.name.toLowerCase().includes(needle))
    .map((unit) => ({
      id: unit.id,
      label: `${unit.name} (${unit.code})`,
      meta: unit.dimension,
    }))
}
