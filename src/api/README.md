# API integration

The management console is live-first. Unless `VITE_USE_MOCK=true` is set
explicitly for the local backend-off design preview, every business screen
reads the tenant backend through the same browser origin.

The integration baseline is
[starforge_edu commit 416f607](https://github.com/MythicalCosmic/starforge_edu/commit/416f607ba9b0a70f54b24f030c76462b2f74f00a)
on `codex/permission-audit-release`. The default backend branch is not
contract-compatible. Required successor changes are tracked in
[backend release actions](../../docs/BACKEND_RELEASE_ACTIONS.md).

## Audience and authentication

The supported login sequence is:

1. `GET /api/v1/auth/session/` to establish the same-origin CSRF cookie;
2. `POST /api/v1/auth/role-login/` with `X-Session-Transport: cookie` and
   `X-CSRFToken`;
3. accept the opaque session only through the backend's Secure, HttpOnly,
   SameSite cookie—the key is never returned to browser JavaScript;
4. `GET /api/v1/users/me/` and require the exact management membership.

The product boundary is deliberately narrow:

- `director` maps to the CEO console;
- `head_of_dept` maps to the manager console;
- every other membership is rejected.

The backend describes both accepted audiences with the broad technical
`principal_kind: "staff"` value. That value alone never grants console access.
Ordinary staff, custom staff roles, teachers, parents, and students all fail
closed.

Live mode never accepts a role from a query string or `VITE_ROLE`. The latter is
only a fixed-fixture development convenience. The browser clears the session
after an authenticated 401 and removes any credential left by older versions in
`localStorage` or `sessionStorage`. Non-secret storage events synchronize login
and logout state across already-open tabs; new tabs discover the shared HttpOnly
cookie through `/users/me/` without ever reading the credential.

Credentials must never be placed in a `VITE_*` variable. Vite embeds every such
value in public browser JavaScript.

## Local live setup

Copy `.env.example` to `.env.local` and keep the API path same-origin:

```env
VITE_API_URL=
VITE_API_PROXY_TARGET=https://starforge.78.111.91.113.nip.io
VITE_USE_MOCK=false
```

Then run:

```powershell
npm ci
npm run dev
```

`vite.config.js` proxies `/api` to `VITE_API_PROXY_TARGET`. This is necessary
because the deployed backend does not currently allow a browser origin such as
`http://localhost:5173` through CORS. Production Nginx performs the equivalent
same-origin proxy with `API_UPSTREAM`.

The public deployment's account data is separate from the backend repository's
local seed tenant. Use a real director or department-head account for the
target tenant.

## Request behavior

`http.js` provides the shared HTTP contract:

- 10-second default request timeout, even when a caller also supplies an abort
  signal; security-sensitive calls may set a shorter explicit timeout;
- same-origin cookie credentials, plus Django's CSRF cookie/header pair on every
  state-changing request;
- `Accept-Language` and a unique `X-Request-ID`;
- JSON request/response handling;
- unwrapping of `{success, data, pagination?, warnings?}`;
- structured `ApiError` fields for status, backend code, validation errors,
  request ID, and retry timing;
- session invalidation and query-cache removal after an authenticated 401.

Callers should display the returned request ID when an operator needs to report
an API failure.

## Query cache and loading behavior

`QueryClientProvider` owns one TanStack Query cache for dashboard, collection,
and selected-record reads. `apiQueryKey()` includes the active language,
request path, and sorted parameters, preventing page, filter, and translation
collisions while deduplicating identical in-flight requests.

Default behavior is:

- 45-second freshness and five-minute garbage collection;
- structural sharing for stable renders;
- one retry for transient 5xx responses and no automatic retry for 4xx;
- stale refresh on reconnect and window focus;
- caller cancellation through the signal supplied by TanStack Query;
- complete cache clearing on sign-in replacement, logout, and authenticated
  401 invalidation.

Do not put credentials or principal IDs into query keys. The cache is cleared at
the identity boundary instead. New read surfaces should use `useQuery`,
`useApiResource`, or `useApiDetail`, not component-local fetch effects.

Use `npm run analyze` to create `dist/bundle-report.html`, an interactive
gzip/Brotli-aware treemap. This is a normal production-mode build: preview data
must remain disabled, and source maps remain off.

## Complete leadership navigation and read catalog

`catalog.js` declares 20 management domains, 104 collection GETs, 79 detail
GETs, and 17 selected-record relations. All 200 unique configured reads have a
route-backed product path; no catalog tab is silently discarded.

`backendPages.jsx` presents the catalog as grouped, full-page leadership
workspaces with clean route IDs and executive-facing copy. Students and
Teachers also have dedicated focused entry points. The CEO navigation exposes
22 visible destinations including Overview; the manager navigation excludes
the organization-wide directory, Finance, and Access & roles by default. If
`/users/me/` supplies `effective_permissions`, `roles.js` removes destinations
and `BackendModule` removes tabs the current session cannot read.

Tabbed views and selected records use nested hash routes, so profiles can be
linked, refreshed, and navigated with browser history instead of accumulating
dialogs. Former module and consolidated route IDs redirect to the matching
restored view while preserving valid record identifiers.

Each catalog entry still declares its endpoint, approved columns and detail
fields, row identifier, pagination behavior, and capability label.
`BackendModule` renders only those fields; it is not a raw JSON inspector.

Related panels substitute only the selected row's identifier, remount when that
identity changes, and fetch independently from the parent list. Paginated
relations keep their own server-side page state; they are never expanded into
eager fan-out requests across every row.

The catalog covers:

- current account and memberships;
- people, guardians, students, teachers, employee accounts, and cohorts;
- organization, branch, and department structure;
- meetings, rooms, schedules, and substitutions;
- messaging directories and AI governance;
- attendance, academics, assignments, and intelligence;
- approvals, money ledger, and finance;
- reports, audit, and operational jobs;
- campaigns, forms, and notifications;
- content, printing, placement, recognition, rulebook, and access
  administration.

The shared `useApiResource` hook normalizes the backend's known list envelopes
on top of TanStack Query and provides server-side search, pagination, manual
retry, cancellation, cached-data continuity, warnings, and explicit
401/403/429/error states. Detail requests are declared only where GET is
actually supported.

The endpoint catalog is covered by `catalog.test.js`, including uniqueness,
field declarations, and regressions that exclude side-effecting or falsely
documented GET routes.
`useApiResource.test.js` covers the four supported collection-envelope shapes.
`auth.test.js` verifies credential replacement and local logout cleanup;
`http.test.js` verifies authenticated/unauthenticated headers, canonical and
backend-declared errors, rejection of nonempty non-JSON success responses, 401
invalidation, and caller-cancellation versus timeout behavior. Exact
director/department-head admission, director
precedence, manager navigation exclusion, and rejection of inactive, revoked,
wrong-kind, and every other non-management principal are covered by
`resolveRole.test.js`.

The current unit suite does not exercise the hook's rendered loading, retry, or
stale-response transitions. Keep those in the browser integration gate until
component-level tests are added.

## No generic live mutations

The former Store context, synthetic record database, generic `api(name)` CRUD
surface, resource registry, response adapters, and legacy mutation forms have
been removed.

Current production business modules declare GET operations only. A future
mutation may be added only after it has:

1. an endpoint-specific request adapter;
2. confirmed CEO/manager authorization and tenant scope;
3. documented success and error responses;
4. idempotency/duplicate-submit behavior where material;
5. mutation and invalidation tests;
6. a real director and department-head smoke test.

Do not simulate missing backend workflows in persistent browser state.

## Backend-off design preview

The preview must be requested explicitly and run through the Vite development
server:

```env
VITE_USE_MOCK=true
VITE_ROLE=ceo
```

It bypasses sign-in with a fixed director or department-head identity and
dynamically serves deterministic GET results from `mockFixtures.js`. Prepared
examples cover the overview, students, teachers, enrollment, branch/risk
signals, notices, decisions, tasks, meetings, and invoices. Unsupported catalog
areas return an empty page with a preview warning rather than invented records.

Use `?role=manager` to inspect the manager surface. There is no persistent CRUD
store, no accepted write method, and no production data request. The mock module
is imported only when both Vite development mode and the explicit preview flag
are active. Vite production builds and Docker refuse preview mode.

The preview must not be used to validate authorization, backend DTOs,
production paging, metric correctness, or feature completeness.

## Important backend limitations

The backend is broad but does not yet provide a complete management product
contract. In particular:

- `/users/me/` does not expose the exact effective grants for a department-head
  manager;
- no consolidated permission-aware CEO dashboard;
- no complete CRM/lead pipeline;
- no payroll register or bulk payroll run;
- no message-thread real-time stream;
- inconsistent pagination envelopes;
- incomplete or inaccurate OpenAPI metadata for important operations;
- wallet reads that provision a missing wallet instead of remaining read-only;
- achievement approval/rejection advertised as GET despite being POST-only.

See [backend gaps](../../docs/BACKEND_GAPS.md) for evidence and
[backend release actions](../../docs/BACKEND_RELEASE_ACTIONS.md) for the pinned
deployment decision, response additions, security fixes, and acceptance gates.

## File map

- `auth.js` — role-native login, current-user bootstrap, password change,
  logout, and tab/session-scoped credential lifecycle.
- `config.js` — immutable Vite environment parsing; live is the default.
- `http.js` — fetch, headers, timeout/cancellation, envelopes, and `ApiError`.
- `queryClient.js` — language-aware query keys, cache policy, and retry policy.
- `mockFixtures.js` — development-only, read-only design-preview responses.
- `catalog.js` — explicit read-only management module definitions.
- `../hooks/useApiResource.js` — list/detail loading and envelope normalization.
- `../pages/backendPages.jsx` — complete leadership workspaces built from
  catalog entries, plus focused Student and Teacher presentations.
