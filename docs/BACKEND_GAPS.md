# Backend Gaps for the CEO / Manager Console

Audit date: 2026-07-26  
Backend repository: `starforge_edu`  
Backend commit inspected: `416f607` (`feat: secure messaging push and thread mute`)  
Live tenant: `https://starforge.78.111.91.113.nip.io`  
Live schema: `https://starforge.78.111.91.113.nip.io/api/schema/`

This ledger records capabilities the management console needs but the backend
does not currently expose cleanly, exposes only as lower-level operations, or
describes incorrectly in OpenAPI. It deliberately separates an absent backend
capability from a frontend implementation defect.

## Executive summary

The backend has broad operational coverage, but it is not a purpose-built CEO
API. The console can read many underlying resources and compose useful views,
yet five product-level gaps remain:

1. Management identity is available, but a department-head manager cannot
   discover the exact effective grants attached to the account.
2. There is no consolidated management dashboard endpoint.
3. Leads are student states, not a complete CRM.
4. Payroll is a set of per-teacher preparation operations, not a payroll
   register or bulk run.
5. Messaging notifications are real-time, but message threads are not.

OpenAPI also cannot yet be treated as executable truth. Method, authentication,
request-body, response-status, error, and pagination details are incomplete or
incorrect for important operations.

## Route coverage disposition

The live schema currently advertises 230 canonical GET paths. The console
configures 200 unique reads:

- 104 collection/tab GETs;
- 79 detail GETs;
- 17 lazy selected-record related GETs.

The 30 remaining schema GET paths are not simply missing pages. They were
reviewed against local backend views and divided as follows.

### Five routes require mandatory selectors

- `/api/v1/academics/honor-roll/` requires `term`;
- `/api/v1/academics/warnings/` requires `term`;
- `/api/v1/access/types/effective-permissions/` requires `principal_kind` and
  `principal_id`;
- `/api/v1/attendance/summary/` requires `student` and `term`;
- `/api/v1/finance/outstanding/` requires `student`.

A generic top-level tab would issue an invalid or misleading request. These need
an explicit selector or a drill-down from a selected entity.

### Ten routes are self-service rather than organization management

- `/api/v1/achievements/mine/`;
- `/api/v1/cards/wallets/me/`;
- `/api/v1/parents/me/children/` and its selected-child report;
- `/api/v1/rewards/grants/mine/`;
- `/api/v1/rulebook/rules/mine/`;
- `/api/v1/students/me/dashboard/` and `/api/v1/students/me/report/`;
- `/api/v1/tasks/mine/`;
- `/api/v1/teachers/dashboard/`.

They belong in the relevant student, parent, teacher, or personal-account
product, not in an organization-wide CEO/manager catalog.

### Eight routes need export, download, receipt, or token UX

- attendance and audit CSV exports;
- content-file download URL;
- asynchronous finance statement status/PDF URL;
- message-attachment download URL;
- payment receipt URL;
- signed iCalendar URL issuance and the public token feed.

Several of these generate short-lived URLs, create audit evidence, or return
non-JSON content. They need purpose-built buttons, download handling, and
operator feedback rather than a generic data table.

### Four routes duplicate or deeply nest existing data

- account-type assignments are a filtered subset of the global assignment tab;
- account-type permissions are already present in account-type detail;
- assignment submissions are already available in the global submissions tab;
- a single cohort-teacher assignment is already represented by the selected
  cohort's teacher-assignment relation.

### Three routes are unsafe or misdocumented

- `/api/v1/cards/wallets/{student_id}/` is labeled GET but provisions a missing
  wallet;
- achievement approve and reject paths are labeled GET but are POST-only.

Those three are intentionally blocked by a frontend regression test and require
backend correction before they can be treated as read operations.

## P0: management authentication is missing from the public schema contract

### What exists

The correct CEO/manager session flow is:

1. `POST /api/v1/auth/role-login/`
2. `GET /api/v1/users/me/`
3. read `role_memberships[].account_type_slug`

Relevant backend evidence:

- `apps/auth/views/v1/auth_views.py:41-86`
- `apps/auth/services/__init__.py:132-208`
- `apps/users/views/v1/users_views.py:207-252`
- `apps/users/presenters.py:29-46,93-123`

`role-login` returns the broad technical principal kind `staff`. That value is
only an authentication transport fact, not the console's audience definition.
The actual product role is represented by the current user's memberships. This
console accepts only `director` (CEO) and `head_of_dept` (manager); ordinary
staff and custom staff memberships are excluded. There is no literal backend
`ceo` or `manager` role:

- `core/permissions.py:67-100`

Canonical `AccountType` grants override the fallback permission matrix:

- `core/permissions.py:592-610,636-680`

### Gap

The OpenAPI public allowlist omits `role-login` and describes it as
bearer-secured even though it is the operation that obtains a bearer session.
Generated clients cannot reliably discover or call the canonical login flow.

### Required backend change

- Publish `POST /api/v1/auth/role-login/` as an unauthenticated operation.
- Describe its exact request DTO, successful response, `must_change_password`,
  rate-limit errors, tenant resolution, and device identifier.
- Describe `GET /api/v1/users/me/` and its membership payload as the canonical
  role/scope bootstrap.
- Add contract tests that compare the published operation to the actual view.

## P1: effective self-capabilities are not available to department heads

### What exists

The backend calculates canonical account-type grants and exposes:

`/api/v1/access/types/effective-permissions/`

However, that operation itself requires `access:read`:

- `apps/access/views/v1/access_views.py:365-376`

### Gap

`/api/v1/users/me/` omits effective grants. A `head_of_dept` manager therefore
cannot discover the exact canonical grants attached to the account type.
Canonical `AccountType` grants can override the fallback permission matrix, so
the membership slug alone is not a complete capability contract. The frontend
must use conservative manager navigation and interpret endpoint 403s.

### Required backend change

Add an authorization-safe self endpoint, preferably within `/users/me/`:

```json
{
  "effective_permissions": ["students:read", "reports:read"],
  "scope": {
    "branches": ["..."],
    "departments": ["..."]
  }
}
```

The response must contain only the current principal's grants and scope and must
not require administrative `access:read`.

## P1: no consolidated management dashboard API

### What exists

The console can compose dashboard data from lower-level endpoints, including:

- `/api/v1/students/stats/`
- `/api/v1/attendance/summary/`
- `/api/v1/intelligence/branches/`
- `/api/v1/finance/outstanding/`
- `/api/v1/reports/*`

Department heads do not have the director's finance visibility.

### Gap

There is no endpoint that returns a consistent, permission-aware management
snapshot. Client-side composition creates:

- multiple network round trips;
- partial dashboards when one dependency fails;
- mismatched time windows and branch filters;
- inconsistent freshness;
- expensive pagination fan-out;
- accidental requests for metrics the current user cannot access.

### Required backend change

Provide a versioned management summary such as:

`GET /api/v1/management/dashboard/?branch=&from=&to=`

It should return only authorized metrics, name every time window and unit, and
include freshness timestamps. Finance fields must be omitted or explicitly
denied when the account lacks finance access.

Until that exists, the frontend must label composed metrics, tolerate partial
failure, and never imply that values share a time window unless verified.

## P1: no full CRM or lead-management domain

### What exists

The closest backend operations are:

- `GET /api/v1/students/?status=lead`
- `POST /api/v1/students/{id}/transition/`

Evidence:

- `apps/students/filters.py:16-36`
- `apps/students/urls.py:32-49`

### Gap

There is no `/leads/` resource and no complete CRM model for:

- pipeline stage history;
- lead owner;
- next follow-up;
- communication/touch history;
- source and campaign attribution;
- loss reason;
- funnel conversion metrics;
- duplicate detection and merging.

The frontend's historical lead board cannot be made genuinely live by mapping
generic lead cards to students alone.

### Required backend change

Either define a dedicated CRM domain or explicitly extend the student-lead
lifecycle with owner, follow-up, touch, source, and history contracts. Publish
funnel metrics and mutation/idempotency rules before enabling management writes.

## P1: no payroll register or bulk payroll run

### What exists

The backend exposes per-teacher operations:

- `GET/POST/PUT /api/v1/teachers/{id}/payout-policy/`
- `POST /api/v1/teachers/{id}/prepare-salary/`
- approval workflow for resulting requests

Evidence:

- `apps/teachers/urls.py:13-18`
- `apps/teachers/views/v1/teacher_views.py:142-197`

The default department-head matrix has `teachers:read` but not
`teachers:write`.

### Gap

There is no:

- payroll-period register;
- bulk preview or run;
- immutable payslip;
- batch approval state;
- payment/export reconciliation;
- payroll totals endpoint;
- bulk retry or rollback contract.

The removed prototype payroll page must not be restored with browser-local rows
presented as authoritative salary records.

### Required backend change

Add an explicit payroll-period aggregate with preview, idempotent run,
line-item/payslip detail, approval, export, and reconciliation operations.
Document director/accountant/department-head permissions separately.

## P2: message threads are not real-time

### What exists

Backend WebSocket routes include:

- `/ws/ping/`
- `/ws/notifications/`
- `/ws/cohorts/{id}/attendance/`

Evidence:

- `infrastructure/websocket/routing.py:7-25`

Production authentication requires the WebSocket subprotocol:

`bearer.<token>`

Query-string tokens are disabled:

- `config/settings/production.py:124-127`
- `infrastructure/websocket/middleware.py:55-113`

Message creation emits a `message.received` notification containing identifiers,
after which a client can refetch the REST thread:

- `apps/messaging/services/__init__.py:243-290`

Reported online state is a five-minute `last_seen` heuristic:

- `apps/messaging/presenters.py:52-101`

### Gap

There is no message-thread WebSocket stream, typing state, delivery/read event
stream, or true presence signal. A polished chat UI cannot honestly claim those
semantics.

### Required backend change

Add a scoped thread channel or explicitly standardize notification-then-refetch
semantics, including ordering, duplicate handling, missed-event recovery, and
read-state updates. Rename or document heuristic `is_online` so the UI does not
present it as authoritative presence.

## P0: OpenAPI is not an executable contract

The live schema audit found 342 paths and 524 operations but only three generic
component schemas. Relevant generator code:

- `core/openapi.py:34-42`
- `core/openapi.py:118-157`
- `core/openapi.py:196-230`
- `core/openapi.py:240-293`

Confirmed problems:

- `role-login` is absent from the public allowlist and marked bearer-secured.
- Wrapper method inference defaults to GET. Achievement approve/reject actions
  are actually POST but are published as GET; the implementation returns 405
  to GET:
  `apps/achievements/views/v1/achievement_views.py:108-115,177-183`.
- Request bodies frequently degrade to a generic object.
- Status codes are guessed by verb. Examples include login returning 200,
  logout returning 204, and reset operations returning 202 rather than the
  guessed defaults.
- Generic errors omit material 405, 409, 422, and 503 responses.
- Operation-specific validation fields and idempotency rules are not described.

### Required backend change

Move important operations to explicit serializers/schema declarations, add
schema regression tests, and validate the published document against executable
request/response examples. Do not generate a production client from the current
schema without a reviewed override layer.

## P0: a schema-visible wallet GET creates state

`GET /api/v1/cards/wallets/{student_id}/` passes its student into
`wallet_payload()`:

- `apps/cards/views/v1/card_views.py:257-262`

The service then calls `get_or_create_for()`, and the repository executes
`Wallet.objects.get_or_create(student=student)`:

- `apps/cards/services/v1/card_service.py:105-107`
- `apps/cards/repositories/card_repository.py:83-91`

The self-service `/wallets/me/` route uses the same service. Consequently, a
GET—or even a HEAD request permitted by the view—can create a database row.
Browser prefetch, link inspection, monitoring, or a read-only management panel
must never have that side effect.

### Required backend change

- Make GET and HEAD return an existing wallet without provisioning it.
- Provision a wallet through an explicit idempotent POST or as part of a
  documented financial write workflow.
- Correct OpenAPI semantics and add regression tests proving that GET and HEAD
  leave database row counts unchanged.
- Keep the current frontend exclusion until the corrected behavior is deployed
  and exercised with a scoped manager account.

## P1: pagination and validation envelopes are inconsistent

The canonical envelope is:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "page_size": 25,
    "pages": 0,
    "has_next": false,
    "has_prev": false
  }
}
```

Evidence:

- `core/responses.py:38-70`

But the backend currently has several variants:

- layered listing maximum page size 100:
  `core/listing.py:20-24,108-123`;
- DRF pagination maximum page size 200:
  `core/pagination.py:6-9`;
- global default page size 25:
  `config/settings/base.py:323-324`;
- notifications use `{results,next,previous}`:
  `apps/notifications/views/v1/notification_views.py:50-72`;
- intelligence nests `count/results/page/page_size/total_pages`:
  `apps/intelligence/views/v1/intelligence_views.py:49-59`;
- validation can return either 400 or 422:
  `core/exceptions.py:59-62`, `core/responses.py:82-83`.

### Required backend change

Standardize one list envelope and one validation status/shape across v1, or
publish endpoint-specific schemas that make each exception explicit. A page
size larger than a service allows should return a stable validation response,
not silently change behavior.

## P1: browser CORS is not configured for direct local access

A live preflight from `http://localhost:5173` to
`/api/v1/users/me/` returned HTTP 200 but did not include
`Access-Control-Allow-Origin`, allowed headers, or allowed methods. It returned
only `Vary: origin`. A browser therefore blocks direct cross-origin development
requests.

The console's Vite and Nginx same-origin proxies are the safe current
mitigation. Do not enable wildcard production CORS, especially for authorized
management requests.

If direct development origins are required, configure an exact allowlist for
the intended scheme, host, and port and include `Authorization`,
`Content-Type`, `Accept-Language`, and `X-Request-ID`.

## Intentionally out of scope

`/api/v1/platform/*` is intentionally public/apex-URL-conf functionality:

- `config/urls_public.py:14-32`

It should not be treated as missing tenant management functionality or exposed
inside the console merely because it appears in route inventory.

## Frontend rules until backend gaps close

- Authenticate only through `role-login`, then bootstrap from `/users/me/`.
- Admit only `director` as CEO and `head_of_dept` as manager. Treat
  `principal_kind: "staff"` as insufficient by itself and reject every other
  staff membership.
- Treat backend authorization and branch/department scoping as authoritative.
- Use conservative department-head navigation because effective grants cannot
  be queried through the self profile.
- Prefer explicit endpoint catalogs and reviewed presenters over generic
  OpenAPI clients.
- Keep the console read-only until each future write has a verified DTO,
  authorization rule, request adapter, and test.
- Do not surface schema-advertised GETs until local code confirms that they are
  side-effect-free and accept GET; keep wallet provisioning and achievement
  decisions excluded.
- Keep required-selector, export, download, receipt, and token operations in
  contextual purpose-built workflows rather than generic tabs.
- Normalize pagination per known endpoint and preserve server totals.
- Use the same-origin proxy rather than relaxing CORS.
- Label dashboard values as composed and tolerate partial failure.
- Do not represent lead, payroll, presence, or chat capabilities that the
  backend does not actually provide.

## Closure criteria

A gap is closed only when:

1. the backend implementation exists;
2. authorization and tenant scope are covered by tests;
3. OpenAPI accurately describes method, security, request, success, and errors;
4. a real director and a real department head have been exercised;
5. the frontend has an endpoint-specific presenter/request adapter and test;
6. the release checklist contains a live smoke test for the capability.
