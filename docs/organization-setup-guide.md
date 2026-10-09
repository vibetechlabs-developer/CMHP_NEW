# Organization Setup — first-time setup guide

Written for: an administrator setting up a new CMHP environment, and engineers picking up related work.

This is the real, working setup screen at `/organization-setup`. It requires an **active superuser** account
(created outside this screen - see "Prerequisite" below); every write it makes is `IsActiveSuperuser` on the
backend, the same rule that already governs the material catalog and the sales-order confirmation policy.

## Prerequisite: an active superuser account

This screen does not create the first administrator account - Django superuser accounts are managed outside the
application API (`python manage.py createsuperuser`, or Django Admin by an existing superuser). Once that account
exists and can log in, its `GET /v1/auth/me/` response includes `capabilities.can_manage_organization_setup: true`,
which is what unlocks this screen - nothing about `is_superuser`/a role label is read anywhere in the frontend to
decide this.

## Exact manual setup sequence for a brand-new environment

1. **Log in** as the superuser account above. The "Organization Setup" sidebar link appears even though no
   company or store exists yet - it is never hidden for a zero-membership account.
2. **Companies tab** → "+ Add company". Provide a code (immutable after creation), legal name, and optionally a
   display name.
3. **Shared stores tab** → "+ Add store", if the environment uses one or more physical stores shared across
   companies. Stores have no owning company by design.
4. **Units of measure tab** → "+ Add unit" for every unit of measure the catalog/formulas will need (mass, volume
   or count dimension; an optional canonical conversion factor for mass/volume units, immutable once set).
5. **Company roles & memberships tab**: pick the company just created.
   - Create at least one role (e.g. "Admin") - new roles start with **no** permissions.
   - Open "Edit permissions" on that role and select the permissions it should hold, grouped by module. Nothing is
     preselected for a brand-new role.
   - Under "Assign an existing user", search for a real user account (this screen does not create new user
     accounts - use the existing User Management screen, `/companies` → Users, for that) and assign them to the
     company, then assign the role you just configured.
6. **Store roles & memberships tab**: repeat step 5 for each shared store, if any.
7. **Sales order confirmation policy tab** (only once Direct Sales Orders will be used): pick the company and
   explicitly answer each of the three questions (Unanswered until you choose Yes or No - nothing is defaulted).
   Configuring this does **not** grant anyone the authority to confirm orders; that is the separate
   `sales_orders.confirm` permission, assigned in step 5's permission editor.

Every step above writes immediately against the real backend; there is no "demo" or local-only mode on this
screen.

## What is covered vs. what is not

| Covered here | Not covered here (use instead) |
|---|---|
| Company/store create, edit, activate/deactivate | Creating new user accounts (`/companies` → Users) |
| Company/store role create, activate/deactivate, full permission editing | Editing an existing role's name/description after creation (backend supports it; no UI wired to it yet) |
| Company/store membership assignment, role assignment | Storage locations within a store (existing Store & Materials screens) |
| Units of measure create, edit (name only), activate/deactivate | Material catalog itself (existing Store & Materials → Materials screen) |
| Sales order confirmation policy, per company | Any other company-level policy (none else exists yet) |

## Reference

Full API contract and implementation detail: `docs/frontend-api-handoff.md` → "Organization Setup wired to the UI".
Screen-by-screen spec: `docs/erp-screen-catalog.md` → "Module: Organization Setup" (OS-01–OS-06).
