# API integration

The management console is live-first. Unless `VITE_USE_MOCK=true` is set
explicitly for local demonstration work, every business screen reads the tenant
backend through the same browser origin.

## Audience and authentication

The supported login sequence is:

1. `POST /api/v1/auth/role-login/`
2. save the returned opaque `access` credential in `sessionStorage`
3. `GET /api/v1/users/me/`
4. require the exact management membership

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
`localStorage`.

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

- 15-second request timeout, even when a caller also supplies an abort signal;
- `Authorization: Bearer <session credential>`;
- `Accept-Language` and a unique `X-Request-ID`;
- JSON request/response handling;
- unwrapping of `{success, data, pagination?}`;
- structured `ApiError` fields for status, backend code, validation errors,
  request ID, and retry timing;
- session invalidation after an authenticated 401.

Callers should display the returned request ID when an operator needs to report
an API failure.

## Read-only management catalog

`catalog.js` declares 20 management modules, 104 collection/tab GET routes, 79
verified detail GET routes, and 17 lazy selected-record related GET routes.
Those 200 paths are unique. Each tab defines its endpoint, columns, detail
fields, row identifier, pagination behavior, and capability label.
`BackendModule` renders only those approved fields; it is not a raw JSON
inspector.

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
and provides server-side search, pagination, retry, caller cancellation,
stale-response protection, and explicit 401/403/429/error states. Detail
requests are declared only where GET is actually supported.

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

## Demonstration fixture mode

Fixture mode must be requested explicitly:

```env
VITE_USE_MOCK=true
VITE_ROLE=ceo
```

It exposes only fixed dashboard counts and local console settings. Backend
management modules are disabled, there is no mock CRUD database, and no
production data endpoint is called. Vite production builds and Docker refuse
fixture mode.

Fixture mode must not be used to validate authorization, backend DTOs,
production paging, or feature completeness.

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

See [`../../docs/BACKEND_GAPS.md`](../../docs/BACKEND_GAPS.md) for backend
evidence, priorities, and closure criteria.

## File map

- `auth.js` — role-native login, current-user bootstrap, password change,
  logout, and tab/session-scoped credential lifecycle.
- `config.js` — immutable Vite environment parsing; live is the default.
- `http.js` — fetch, headers, timeout/cancellation, envelopes, and `ApiError`.
- `catalog.js` — explicit read-only management module definitions.
- `../hooks/useApiResource.js` — list/detail loading and envelope normalization.
