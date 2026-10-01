# Junior Developer Handoff — Connecting the React Frontend to This Backend

Audience: the junior developer wiring up the existing React app (login,
workspace selection, order screens already built) to this Django API.
Scope: only what is needed to make those screens call real endpoints and
render a sales order draft end to end. This is not a new business module —
every endpoint referenced here already exists and is documented in full in
`docs/frontend-api-handoff.md`; this document is a shorter, task-specific
path through it.

Setup confirmed for this handoff: both machines are on the same local
network; the frontend runs at `http://localhost:5173` (Vite default) on
the junior's machine; the backend runs on the lead's machine, LAN address
`192.168.1.11`.

---

## 1. Two ways to reach the backend — use the proxy

### Recommended: Vite dev-server proxy (do this first)

Add to the frontend's `vite.config.ts`:

```ts
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://192.168.1.11:8001",
        changeOrigin: true,
      },
    },
  },
});
```

Then call the API as **relative paths** (`/api/v1/auth/csrf/`, etc.) —
never `http://192.168.1.11:8001/api/v1/...` directly in `fetch`/`axios`
calls. The browser only ever talks to `http://localhost:5173`; Vite's dev
server forwards the request to the lead's machine over the LAN.

**Why this is the recommended approach, not just "turn on CORS":** the
refresh token lives in an HttpOnly cookie with `SameSite=Lax`
(`AUTH_REFRESH_COOKIE_SAMESITE`). A `SameSite=Lax` cookie is **not** sent
on a cross-site `fetch`/`XHR` request — only on a top-level navigation.
`localhost:5173` and `192.168.1.11:8001` are different sites (different
host, and browsers don't treat `localhost`-style names as related to an
IP), so a direct cross-machine call would silently never carry the
refresh cookie, breaking refresh and logout in ways that are easy to miss
in manual testing. `SameSite=None` would fix that but requires
`Secure` (HTTPS), which this dev setup does not have. The proxy sidesteps
all of this: from the browser's point of view every request is
same-origin, so the cookie behaves normally and no CORS preflight is
needed either.

### Fallback: direct cross-origin calls (Postman, curl, or if the proxy isn't usable)

The backend now accepts direct browser calls from `http://localhost:5173`
if the environment variables below are set (see §2). Use the full URL
`http://192.168.1.11:8001/api/v1/...` and set `credentials: "include"` on
every `fetch` call (or `withCredentials: true` in axios) so the refresh
cookie is sent. Expect the refresh cookie to work here too, since
`http://localhost:5173` calling `http://192.168.1.11:8001` directly is
still cross-site under `SameSite=Lax` — **this fallback path currently
cannot rely on the refresh cookie working from a browser.** It's kept
configured for tooling (Postman/curl, which don't enforce SameSite) and
as a documented option if a future setup adds HTTPS. **Use the proxy.**

---

## 2. Backend configuration already made (dev only, not committed to `.env`)

Already done on the lead's machine, in code (not secrets):
- `django-cors-headers` installed and wired in (`corsheaders` app +
  `CorsMiddleware`, `CORS_ALLOW_CREDENTIALS = True`).
- `config/settings/local.py` now reads `CSRF_TRUSTED_ORIGINS` from the
  environment (it didn't before).
- Both `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` default to
  **empty** — nothing is enabled until the lead's own `.env` sets them,
  so a plain single-machine local run is unaffected.

**Required addition to the lead's own `backend/.env`** (not made
automatically — the real `.env` is never edited by anyone but its owner):

```
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.11
DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:5173
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
```

`DJANGO_ALLOWED_HOSTS` must include the LAN IP or Django rejects the
request at the host-header level before it reaches any view. The other
two lines only matter for the fallback path in §1, but cost nothing to
set — leaving them out does not affect the recommended proxy path, since
the proxy makes every request look same-origin regardless.

**Start the server bound to the LAN**, not just loopback:

```
python manage.py runserver 0.0.0.0:8001
```

(`127.0.0.1:8001` — the existing convention in `docs/demo-runbook.md` —
only accepts connections from the same machine; `0.0.0.0:8001` accepts
connections from other machines on the network. Port 8000 stays free for
whatever else already uses it.) Do not run this outside a trusted LAN —
it is not authenticated at the network level, only at the application
level.

**Caveat**: `192.168.1.11` is a DHCP-assigned address and can change on
reboot/reconnect. If the connection stops working, check the lead's
current IP again (`ipconfig` → the Wi-Fi adapter's IPv4 address) before
assuming something else broke.

---

## 3. Demo user for this flow

A suitable demo user already exists: **`demo_sales`**, active, with an
active membership on company `DEMOA` and these permissions there:
`customers.view`, `products.view`, `sales_orders.view`,
`sales_orders.create`, `sales_orders.edit`, `quotations.view`,
`quotations.create`, `quotations.edit`. That is sufficient for
login → workspace → customer/product lookup → create/list/retrieve a
sales order draft — no additional grant is needed for this flow.
(`demo_sales` has no access to company `DEMOB` or the shared store — not
needed for this flow, since sales orders are company-scoped only.)
Ask the lead for the password out of band; it is intentionally not
repeated in this document.

`DEMOA` currently has 1 active customer and 2 active products seeded —
enough to exercise the lookup and create screens, not a realistic catalog.

---

## 4. API contract — the exact sequence

Base URL: `/api/v1/` (relative, via the Vite proxy — see §1). All
requests below assume the proxy is in place.

### 4.1 Auth bootstrap (do this once per session, in order)

```
GET  /api/v1/auth/csrf/                          -> 200 {"csrfToken": "..."} + Set-Cookie csrftoken
POST /api/v1/auth/login/                          -> 200 {"access": "...", "user": {...}} + Set-Cookie refresh_token (HttpOnly)
     body: {"username": "demo_sales", "password": "<ask the lead>"}
     header: X-CSRFToken: <csrfToken from step 1>
GET  /api/v1/auth/me/                             -> 200 {id, username, email, first_name, last_name}
     header: Authorization: Bearer <access>
GET  /api/v1/companies/mine/                      -> 200 {"companies": [{"id": ..., "code": "DEMOA", ...}]}
GET  /api/v1/stores/mine/                         -> 200 {"stores": [...]}   (may be empty — demo_sales has none, that's valid)
```

- Access token: keep in memory only (not localStorage), attach as
  `Authorization: Bearer <access>` on every authenticated call. Expires
  in 5 minutes.
- Refresh token: the browser handles the cookie automatically — never
  read or set it from JS. Call `POST /api/v1/auth/refresh/` (with the
  CSRF header again) either on a timer or reactively on a 401. One retry
  per failed request, never a loop. On a failed refresh, treat it as
  logout.
- `POST /api/v1/auth/logout/` (CSRF header required) → 204, clears the
  cookie.
- Full error-shape and refresh-trigger rules: `docs/frontend-api-handoff.md`
  §0.3–0.4 and §18.

### 4.2 Workspace loading

After `companies/mine/` returns `DEMOA`'s `id` (call it `<company_id>`),
fetch the effective permission list for the UI to decide what to show:

```
GET /api/v1/companies/<company_id>/my-permissions/
    -> 200 {"company_id": ..., "permissions": ["customers.view", "products.view", "sales_orders.view", "sales_orders.create", ...]}
```

Never treat the frontend's remembered company/store selection as a
security boundary — the backend re-authorizes every request against the
real ID in the URL regardless of what the UI last had selected
(`docs/frontend-api-handoff.md` §0.8).

### 4.3 Customer and product lookup

```
GET /api/v1/companies/<company_id>/customers/?is_active=true   -> paginated {"count", "next", "previous", "results": [...]}
GET /api/v1/companies/<company_id>/products/?is_active=true    -> paginated, same envelope
```

Permission: `customers.view` / `products.view` (both already granted to
`demo_sales`). `?is_active=true` is a strict boolean filter — anything
other than `true`/`1`/`false`/`0` is a 400.

### 4.4 Create a sales-order draft

```
POST /api/v1/companies/<company_id>/sales-orders/
Permission: sales_orders.view + sales_orders.create

{"customer_id": <id from 4.3>, "order_date": "2026-09-29",
 "requested_delivery_date": "2026-10-15",
 "currency": "INR",
 "lines": [{"product_id": <id from 4.3>, "quantity": "2", "unit_price": "10.50"}]}

-> 201 {"id": ..., "reference": "SO-20260929-XXXXXXXXXX", "status": "DRAFT",
        "version": 1, "lines": [...], "subtotal": "21.00", ...}
```

`customer_id`, `order_date`, `currency` are required; `lines` may be
omitted or empty for a blank draft. Save `version` from the response —
any future edit needs it as `expected_version`. Full field-by-field rules
(quantity/price precision, rejected fields, snapshot behavior):
`docs/frontend-api-handoff.md` §13.3.

### 4.5 List and retrieve the saved order

```
GET /api/v1/companies/<company_id>/sales-orders/?search=&customer=&page=&page_size=
    Permission: sales_orders.view
GET /api/v1/companies/<company_id>/sales-orders/<id>/
    Permission: sales_orders.view
```

Both return the same order shape as the create response (§13.5 in the
full handoff doc). The list is always newest-first and paginated
(20/page by default, `?page_size=` up to 100).

### 4.6 Standard error shapes to handle

| Status | Shape | Meaning |
|---|---|---|
| 400 | `{"<field>": ["..."]}` or `{"detail": "..."}` | Validation failure |
| 401 | `{"detail": "..."}` | Missing/expired token, or failed refresh — force logout |
| 403 | `{"detail": "..."}` | Authenticated, but missing the specific permission |
| 404 | `{"detail": "Not found."}` | No such resource, **or** no access to it — indistinguishable by design |
| 409 | `{"detail": "..."}` | Stale `expected_version` on an edit — refetch and show the conflict, never silently retry |

Full detail: `docs/frontend-api-handoff.md` §0.7.

---

## 5. What was verified, and how

**Backend-only (no browser needed) — done:**
- `python manage.py check` — clean, no issues, with the new CORS app/
  middleware/settings loaded.
- Settings load correctly with the LAN env vars set: `CORS_ALLOWED_ORIGINS`,
  `CORS_ALLOW_CREDENTIALS`, `CSRF_TRUSTED_ORIGINS` all resolve as expected;
  `corsheaders` is installed and `CorsMiddleware` sits before
  `CommonMiddleware` as required by the package.
- Confirmed the same settings default to empty/unset when the new env
  vars are absent — a plain single-machine local run is unaffected by
  this change.
- Confirmed `demo_sales`'s exact company/permission/membership state via
  a read-only database query (§3) — nothing was changed.
- Confirmed `DEMOA` has active customers/products to look up.

**Needs an actual browser (not yet done here — do this once the frontend
is pointed at the proxy):**
- The real CORS preflight (`OPTIONS`) and cross-machine cookie behavior
  can only be observed from an actual browser tab on the junior's
  machine — settings loading correctly is necessary but not sufficient
  proof that login/refresh work end to end over the LAN.
- The full ERP test suite was **not** rerun for this change (out of
  scope — this is a configuration change, not a business-logic change).

---

## 6. Constraints that stayed in effect

- No `.env` file was edited — only `.env.example` (the template) and
  settings code. The three lines above must be added to the real
  `backend/.env` by the lead.
- No existing user/permission/role was changed. No demo data was created
  or modified.
- Port 8000 and any process using it were left untouched; the dev server
  itself was not started as part of this task.
- CSRF was not disabled anywhere, and no wildcard/unrestricted
  credentialed CORS origin was configured — `CORS_ALLOWED_ORIGINS` and
  `CSRF_TRUSTED_ORIGINS` both name `http://localhost:5173` explicitly.
