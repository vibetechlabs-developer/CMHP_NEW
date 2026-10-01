# CMHP ERP — Frontend Build Sequence

Recommended implementation order for the frontend, phased so each phase
only depends on APIs that already exist and are tested. Screen IDs
reference `docs/erp-screen-catalog.md`; endpoint details are in
`docs/frontend-api-handoff.md`.

---

## Reusable frontend elements (build once, in Phase 1)

Define these before any screen work starts — nearly every later screen
depends on them, and building them ad hoc per-screen is the single easiest
way to end up with seven slightly different table components.

- **Forms**: a form wrapper that (a) reads a resource's "prohibited
  fields" implicitly by only rendering fields the API contract says are
  writable at the current lifecycle stage, and (b) surfaces DRF's
  field-keyed 400 response directly onto the matching form field.
- **Tables**: a data table that consumes the standard `{count, next,
  previous, results}` envelope, but can also be pointed at a bare-array
  endpoint (the four unpaginated membership/role-assignment lists, §0.6 of
  the API handoff) without assuming pagination controls exist.
- **Filters**: a search/filter bar bound to `?search=` and `?is_active=`
  (strict boolean) as a default, extensible per-screen for the few
  endpoints with extra params (`?status=`, `?kind=`, `?scope=`, etc.).
- **Pagination controls**: driven by `count`/`next`/`previous`, with a
  page-size selector capped at 100 (the server-enforced maximum) — and a
  documented escape hatch for "fetch everything up to the cap" screens
  like the permission picker (ADM-10), which should request
  `?page_size=100` explicitly rather than paging through 20 at a time.
- **Permission-aware actions**: a single component/hook that hides or
  disables a button based on the permission codes returned by
  `/my-permissions/` (company or store) — but the backend re-checks every
  action regardless, so this is a UX convenience only, never treated as
  the real access control.
- **Status badges**: one shared badge component per status enum (PR:
  DRAFT/SUBMITTED/APPROVED/REJECTED/CANCELLED; PO:
  DRAFT/ISSUED/CANCELLED; GR: DRAFT/POSTED/CANCELLED; delivery progress:
  NOT_RECEIVED/PARTIALLY_RECEIVED/FULLY_RECEIVED) — each with a fixed
  color/label so status never gets re-invented per screen.
- **Detail/history tabs**: a generic tabbed-detail-page shell (used by
  ADM-03, PR-03, PO-03, GR-03) — one "identity/edit" tab plus N read-only
  history/nested-data tabs.
- **Confirmation dialogs**: one shared confirm-dialog component that can
  optionally require a text reason field (used by every cancel/reject
  action) — do not build a bespoke modal per action.
- **Validation messages**: a shared renderer for the two error shapes that
  appear everywhere — `{"<field>": ["<msg>"]}` (attach to the field) and
  `{"detail": "<msg>" | ["<msg>"]}` (show as a form-level or toast
  message).
- **Conflict (409) handling**: one shared handler implementing the exact
  pattern in the API handoff's §8 — refetch, show what changed, never
  auto-resubmit a business decision. Every mutating screen wires into this
  one handler rather than writing its own retry logic.

---

## Phase 1 — Shared components and API/session infrastructure

**Screens**: none yet (infrastructure only).
**APIs available**: `GET /api/v1/auth/csrf/`, `POST /api/v1/auth/login/`, `POST /api/v1/auth/refresh/`, `POST /api/v1/auth/logout/`, `GET /api/v1/auth/me/`.
**Dependencies / unresolved decisions**: none — this phase only needs the auth app, which is fully implemented and stable.
**Acceptance checklist**:
- [ ] HTTP client attaches `Authorization: Bearer` automatically and refreshes on 401 exactly once per failed request (no retry loop)
- [ ] CSRF token fetched once at app start and attached to every login/refresh/logout POST
- [ ] Refresh token cookie never read or written by frontend code — only observed via successful/failed API calls
- [ ] All reusable components above exist, unit-tested against synthetic API responses, not live data
- [ ] Global 401 → forced logout wired end-to-end

---

## Phase 2 — Login and company/store context

**Screens**: AUTH-01, NAV-01, NAV-02, NAV-03.
**APIs available**: everything in Phase 1, plus `GET /api/v1/companies/mine/`, `GET /api/v1/stores/mine/`, `GET /api/v1/companies/<id>/my-permissions/`, `GET /api/v1/stores/<id>/my-permissions/`, `GET /api/v1/stores/<id>/overview/`.
**Dependencies / unresolved decisions**: none blocking. Note for design: a user may legitimately have zero companies and zero stores — the empty state on NAV-01 is a real, expected condition, not an error state.
**Acceptance checklist**:
- [ ] Company/store switcher populates from `/mine/` endpoints only — never a hardcoded list
- [ ] Selecting a company/store is understood by the frontend team as a UI convenience only (API handoff §0.8) — no frontend code should treat the selection itself as an authorization decision
- [ ] Empty-state (no company/store access) renders correctly, not as an error
- [ ] my-permissions data feeds the permission-aware-action component from Phase 1

---

## Phase 3 — Existing master screens

**Screens**: ADM-01–14 (users, companies, permissions, roles, stores, memberships), CAT-01–04 (units, categories, materials, storage locations), SUP-01–02 (suppliers).
**APIs available**: all of §1–4 in the API handoff — fully implemented and stable, covered by per-module test runs recorded in `docs/backend-tasks.md` (the 958-test full-suite figure is historical Task 09A evidence, not a claim about today's code).
**Dependencies / unresolved decisions**: none functionally blocking. Worth flagging to design: `Supplier.is_active` and `Material.is_active` mean only "in use" — never "QC-qualified" or "approved" — the UI copy on SUP-02/CAT-03 should not imply otherwise (see open decisions doc, supplier qualification item).
**Acceptance checklist**:
- [ ] All superuser-only screens correctly hidden/blocked for non-superusers (403/redirect), not just visually hidden
- [ ] Table/filter/pagination components from Phase 1 reused without modification on at least 6 of these screens (proves genericity)
- [ ] Activate/deactivate flows work everywhere with no separate "delete" affordance anywhere (there is no DELETE endpoint in this backend at all)
- [ ] Permission-picker (ADM-10) requests `?page_size=100`, verified to actually show every catalog entry, not just the first 20

---

## Phase 4 — Purchase requests and approval

**Screens**: PR-01–05.
**APIs available**: full §5 of the API handoff — implemented and tested (127 dedicated tests).
**Dependencies / unresolved decisions**:
- The "different approver per round-step" restriction (§3.2 of the client flow doc) is **provisional**, not client-confirmed — build the UI to enforce/display it as current backend behavior, but do not present it in client-facing copy as a permanent rule.
- The existing gap where `purchase_requests.cancel` alone is documented as insufficient for a SUBMITTED request (needs `purchase_requests.cancel_pending` instead) is already fixed in the backend — no frontend workaround needed, just implement the two distinct permission checks as documented.
**Acceptance checklist**:
- [ ] Approve/Reject buttons are hidden for the request's own creator (backend also enforces this — this is UX polish, not the real control)
- [ ] Every mutating action sends `expected_version` read from the last fetch, never a cached/stale value from page load
- [ ] Approve/Reject additionally send `expected_round`/`expected_step` read fresh, never hardcoded
- [ ] 409 on stale version/round/step triggers the shared conflict handler (Phase 1), not a raw error toast
- [ ] Rejected → revise → resubmit correctly shows a **new** round starting at step 1, with the prior round's full history still visible and unmodified

---

## Phase 5 — Purchase orders

**Screens**: PO-01–05.
**APIs available**: full §6 of the API handoff — implemented and tested (96 dedicated tests).
**Dependencies / unresolved decisions**:
- "PO company always equals source PR's company, no cross-company purchasing" is a **proposed policy**, not confirmed (client flow doc §6, open decisions doc). If the client later rejects this policy, PO-02's supplier-and-currency-only creation flow would need to change to accommodate a company choice — flag this as a design risk now rather than hardcoding an assumption that company selection will never appear on this screen.
- Currency support for issuing is a narrow allowlist (INR/USD/EUR/GBP) — PO-02's currency field should not be built as a free-text ISO-4217 picker implying full support; a shape-only 3-letter validator plus a visible "issuing supported for: ..." note is more honest to the current backend.
**Acceptance checklist**:
- [ ] "Create Purchase Order" only reachable from an APPROVED request with no existing active order (backend enforces the constraint; frontend should not offer a dead-end action)
- [ ] Issue confirmation dialog explicitly warns issuing is permanent and not proof of supplier contact (client-flow doc §3.4) — this is required copy, not optional polish
- [ ] Issue-time 400s (zero-price line, unsupported currency, past delivery date, inactive supplier/material) each render as a specific, actionable message, not a generic failure
- [ ] Issue Snapshot tab (PO-04) renders correctly even when several supplier contact fields are blank (they are optional and frequently empty in this dataset)

---

## Phase 6 — Goods receiving

**Screens**: GR-01–07.
**APIs available**: full §7 of the API handoff — implemented and tested (64 dedicated tests).
**Dependencies / unresolved decisions**:
- Dual store+company access (client-flow doc §3.5, open decisions doc) is genuinely more complex than any earlier screen's access model — budget extra time for the 404-vs-404 (never 403) behavior on the company axis, and test it explicitly, not just the happy path.
- No over-delivery tolerance and no posted-receipt correction/reversal are both **open, unresolved** questions (open decisions doc). Do not build any "adjust a posted receipt" affordance — there is nowhere for it to call; if the client asks for one during this phase, escalate rather than improvising a workaround against undocumented behavior.
**Acceptance checklist**:
- [ ] Eligible-purchase-orders picker (GR-06) never renders a price/currency/subtotal column — confirm by inspecting the actual API response shape, not by trusting a wireframe
- [ ] `idempotency_key` generated once per create-form session (a fresh UUID), reused across retried submit clicks, not regenerated per HTTP attempt
- [ ] Post confirmation dialog explicitly states posting is permanent and checked against every store's cumulative receipts, not just this one
- [ ] A POSTED receipt's detail screen shows no Edit/Cancel affordance at all (not just disabled — absent, since there is no backend path for either)
- [ ] Delivery-progress badges (NOT_RECEIVED/PARTIALLY_RECEIVED/FULLY_RECEIVED) are never labeled or styled in a way that implies QC acceptance or usable stock

---

## Phase 6.5 — Incoming QC inspection drafts

**Screens**: QC-01–05.
**APIs available**: full §8 of the API handoff — implemented and tested (60 dedicated tests, Task 09B-1).
**Dependencies / unresolved decisions**:
- This phase implements **drafting only**. There is no accept/reject/release action anywhere in the backend — do not design a disposition button, status badge, or workflow step that implies one exists. That is Phase 7's PLAN-05 (Incoming QC Disposition), not started.
- The company-access check here is deliberately **narrower** than Goods Receiving's (bare membership, no `purchase_orders.view`) — do not copy GR-06's access logic verbatim onto QC-04; verify against §8.1's actual permission table.
- No pharmaceutical test specification/limit catalog exists — the observation form (QC-03) must stay pure free-text entry; do not build a dropdown of "standard tests" or a pass/fail indicator, since nothing in the backend validates against either.
**Acceptance checklist**:
- [ ] QC-04's eligible-lines picker never renders a price/currency column, and excludes any line that already has an active inspection
- [ ] The observation editor (QC-02/QC-03) uses the full-replace PATCH contract correctly — omitted `observations` key leaves existing rows untouched, `[]` clears them, confirmed against real API responses not assumed
- [ ] A CANCELLED inspection's detail screen shows no Edit affordance at all (absent, not disabled)
- [ ] No Accept/Reject/Release button, disposition status badge, or specification-compliance indicator appears anywhere in this phase's screens
- [ ] `inspection_date` client-side validation (not before the receipt's arrival date, not in the future) mirrors the server's own check, but the server's 400 response is still the authoritative source of truth if they ever disagree

---

## Phase 7 — Planned modules, after backend contracts exist

**Screens**: PLAN-01 through PLAN-16 (customer orders, batch planning, formula/BOM, stock ledger, incoming QC **disposition** (drafting is now Phase 6.5, not this phase), material release, production planning, BMR, packaging/filling, final QC/QA, invoicing, dispatch, reference books, TQM, reports, Tally integration).
**APIs available**: **none.** No backend design, task, or endpoint exists for any of these yet.
**Dependencies / unresolved decisions**: everything — these modules have not been scoped with the client at all (`docs/erp-client-flow.md` §2.1, §2.3–2.6). Do not begin frontend work here until a corresponding backend task has shipped and been documented the way Phases 4–6 were (see this project's own precedent: policy proposal doc → implementation → test suite → API handoff entry).
**Acceptance checklist**: not applicable until a backend contract exists. When one does, follow the same phase-shape as Phases 4–6: screens → available APIs → dependencies/open decisions → acceptance checklist, added as a new section here rather than retrofitted into this placeholder.
