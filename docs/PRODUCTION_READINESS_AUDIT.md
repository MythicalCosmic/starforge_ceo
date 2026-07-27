# StarForge CEO / Manager Console Production-Readiness Audit

Audit date: 2026-07-26  
Frontend repository: `starforge_ceo`  
Backend repository inspected: `starforge_edu`  
Backend commit inspected: `416f607`  
Live tenant inspected: `https://starforge.78.111.91.113.nip.io`

## Decision

The original repository was not safe to deploy as a production management
console. It defaulted to synthetic data, accepted a browser-selected privileged
role, used the wrong management login operation, allowed a bearer credential to
be compiled into public JavaScript, persisted credentials across browser
restarts, had no automated tests or CI gate, and shipped an unhardened static
container.

This remediation removes those release-blocking defaults and adds the missing
management surfaces that can be supported honestly by the current backend.
The result is a materially safer release candidate, not an unconditional
"production ready" declaration.

Release remains conditional on the acceptance gates in this document. In
particular, a real director and a real department head must be exercised against
the intended tenant, the container must pass its CI smoke test, and the
remaining backend/product limitations must be accepted or closed.

## Verification record for this checkout

The integrated frontend tree was verified after all concurrent implementation
work landed:

| Check | Result |
| --- | --- |
| `npm ci --no-fund` | Passed; 185 packages installed from the lockfile |
| `npm run lint` | Passed with zero errors and zero warnings |
| `npm test` | Passed; 7 files and 32 tests |
| `npm run test:coverage` | Passed across 9 instrumented files: 68.37% statements, 59.64% branches, 62.02% functions, and 74.31% lines; the instrumented API layer reached 92.53% line coverage |
| Fixture-mode `npm run build` | Rejected with the required nonzero exit and explicit live-build error |
| Live-mode `npm run build` | Passed with Vite 6.4.3; 93 modules produced 16 files totaling 761,552 bytes with no source maps |
| Repeated live build | Passed; consecutive artifact manifests had the same SHA-256 fingerprint, `c9b539d93c430fe41b75d9355223f992717a8a13c8fd827057babbf4b0f8ab71` |
| `npm run check` after coverage generation | Passed; generated reports are excluded from source linting |
| `npm audit` | Passed; 0 known vulnerabilities |
| `npm run audit:production` | Passed; 0 known vulnerabilities |
| `npm ls --depth=0` | Passed; declared top-level dependency tree is consistent |
| CI and Compose YAML parse | Passed |
| Entrypoint syntax and invalid-origin cases | Passed; CR/LF injection, credentials, paths, port 0, and port 65536 were rejected before template rendering |
| `git diff --check` | Passed |
| `npm run validate:schema` | Passed against the live schema: 342 paths, 524 HTTP operations, 20 modules, 104 tabs, and 200 configured GETs with zero missing or duplicate routes |
| Local API proxy route | Empty POST reached `/api/v1/auth/role-login/` through port 5173 and returned the expected validation response, HTTP 422 rather than a frontend 404 |
| Localhost-origin live preflight | HTTP 200 without `Access-Control-Allow-Origin`, confirming the same-origin proxy requirement |
| Manual browser layout and access smoke | Passed for CEO navigation (22 entries), manager navigation (19 entries), forbidden ordinary staff, desktop detail views, a 390-pixel viewport, and paginated related records |

The thirty-two tests exercise the endpoint catalog, supported collection
envelopes, transport/session behavior, and strict CEO/manager membership
boundary, but they do not justify a broad product-quality claim. The missing
suites listed later remain required follow-up.

Those percentages describe only the nine files imported by the current unit
suite, not the entire application tree. Vitest does not yet use an include-all
coverage configuration or enforce a minimum threshold.

Docker and Nginx are unavailable on this workstation, so no local image build
or `nginx -t` result is claimed. The checked-in CI container job is the required
execution gate for those artifacts.

## Scope and method

The audit covered:

- the complete tracked frontend tree and Git history;
- Vite/React build and runtime configuration;
- authentication, role resolution, HTTP behavior, and endpoint presenters;
- page/navigation coverage against backend routes;
- error, loading, empty, cancellation, and stale-request behavior;
- responsive layout, keyboard behavior, and accessibility foundations;
- dependency, lockfile, test, CI, and release reproducibility;
- Docker/Nginx privilege, filesystem, proxy, caching, and security headers;
- the local Django backend implementation, routes, permissions, presenters,
  pagination, WebSockets, and OpenAPI generator;
- live schema and browser preflight behavior.

This was a source and contract audit. It did not use production credentials,
mutate tenant records, or assert that data visible in the public tenant is
complete.

## Repository evidence

The original checkout mixed the actual application under `app/` with root-level
artifacts:

- 80 of 90 tracked files lived below `app/`;
- the root lockfile was a 102-byte empty package lock rather than the
  application's dependency lock;
- the root README was a 38-byte UTF-16 stub while product documentation was
  duplicated elsewhere;
- seven identical pasted screenshots were tracked under `uploads/`;
- those screenshots consumed 6,919,024 bytes of a 7,487,145-byte logical tree;
- each screenshot was 988,432 bytes with SHA-256
  `8B01CF6AE3236EC443265FBF93B69721BFF378AD3EC6EF2844B4A49D045CB7DF`;
- generated `node_modules` and `dist` directories also existed in the local
  application folder;
- nine historical commits were scanned for common credential patterns; no
  committed bearer token, API key, private key, or password assignment was
  found by that scan.

The application is now flattened to the repository root. Scratch uploads,
duplicate/stale Markdown files, generated output, and dependency folders are
excluded. The root package and lockfile are now the only dependency manifest.

## Severity summary

| Severity | Original finding | Current disposition |
| --- | --- | --- |
| Critical | Production defaulted to the mock database | Resolved: live is default; only fixed dev fixtures remain; production Vite builds reject fixture mode |
| Critical | `?role=ceo` could select the privileged UI | Resolved in live mode: role comes from authenticated memberships |
| High | Wrong generic login endpoint for the CEO/manager audience | Resolved: role-native login then `/users/me/` bootstrap |
| High | Optional bearer token could be bundled through `VITE_API_TOKEN` | Resolved: build-time token support removed |
| High | Bearer token persisted indefinitely in `localStorage` | Resolved: tab/session-scoped storage and legacy-token removal |
| High | Generic legacy forms could send incompatible live DTOs | Resolved: Store, CRUD client, adapters, and forms removed |
| High | Missing backend modules created false product completeness | Improved: supported read-only modules added; true gaps documented |
| High | No reliable manager capability discovery | Backend gap: conservative department-head surface required |
| High | Unpinned/non-reproducible container install | Resolved: exact images, lockfile-only `npm ci` |
| High | Root Nginx container with a writable filesystem | Resolved in Compose: unprivileged, read-only, no capabilities |
| Medium | Direct browser API calls fail deployed CORS policy | Resolved operationally by same-origin Vite/Nginx proxy |
| Medium | No tests, coverage command, or CI | Resolved at baseline; browser E2E remains a release follow-up |
| Medium | No response security headers | Resolved in Nginx; HSTS remains the HTTPS edge's responsibility |
| Medium | No protected error boundary or stale-request control | Resolved in application infrastructure |
| Medium | Repository noise obscured review and deployment root | Resolved by flattening and ignore rules |
| Medium | OpenAPI was assumed to be authoritative | Documented and contained; backend contract work remains |

## Detailed findings and remediations

### 1. Data source and demo leakage

#### Original risk

`VITE_USE_MOCK` defaulted to true. An absent or misspelled production variable
therefore produced a convincing management application backed entirely by
synthetic browser data. Operators could act on fictional metrics without a
visible deployment failure.

The old flag parser also treated every value except the literal string `false`
as enabled. A typo such as `flase` silently activated mocks.

#### Remediation

- Live API mode is now the default.
- Fixture mode accepts only explicit truthy values.
- The synthetic record database, generic CRUD client, and fake business pages
  were removed.
- Fixture mode contains only fixed dashboard counts and local settings; backend
  modules are disabled.
- `.env.example` labels fixture controls as development-only.
- Every Vite production build rejects fixture mode, and Docker additionally
  requires exactly `VITE_USE_MOCK=false`.
- Documentation states that fixed fixtures are not backend-contract evidence.

#### Acceptance test

Build with no `.env`, serve the bundle, and verify that an unauthenticated user
sees the login boundary rather than synthetic company data. A release build
with `VITE_USE_MOCK=true` must fail.

### 2. Authentication and authorization boundary

#### Original risk

The console posted management credentials to `/api/v1/auth/login/`, did not
bootstrap the authenticated principal from `/users/me/`, and derived the
visible role from `VITE_ROLE` or the `?role=` query parameter. It could display
CEO navigation without proving that the current principal was a director.

The HTTP client could read `VITE_API_TOKEN`, which would publish an opaque
credential to every bundle user. Runtime credentials were stored in
`localStorage`, surviving browser restarts and increasing exposure on a shared
management workstation.

#### Remediation

- Login uses `POST /api/v1/auth/role-login/`.
- The client then requests `GET /api/v1/users/me/`.
- `director` maps to the CEO console.
- `head_of_dept` alone maps to the manager console.
- The backend's broad `principal_kind: "staff"` value is treated only as a
  technical precondition, never as product authorization.
- Ordinary/custom staff and all non-staff principals are rejected.
- Query/environment role selection exists only in explicit fixture development.
- No token is accepted from `VITE_*`.
- The opaque credential is stored in `sessionStorage`.
- A 401 clears the browser session and notifies the auth provider.
- Logout clears local state even if server logout fails.
- Password-change responses rotate the stored credential.

#### Residual risk

The backend does not expose a department head's effective permissions through
an authorization-safe self endpoint. Manager navigation therefore uses a
conservative role-level surface while the server remains authoritative. A
visible page is not proof that an endpoint is authorized.

#### Acceptance test

Exercise at least:

1. a director;
2. a department head;
3. an ordinary staff membership that must be rejected;
4. a custom staff membership that must be rejected;
5. a teacher or parent account that must be rejected;
6. an expired/revoked session;
7. password change and logout.

Verify both visible navigation and backend 403 behavior. No test may depend on a
query-string role in live mode.

### 3. API contract and mutation safety

#### Original risk

The historical screens use short presentation keys, joined labels, and
browser-generated objects that do not match Django request DTOs. A generic CRUD
client could send malformed, unauthorized, or destructive writes. Several
screens also implied domains the backend does not actually own, particularly
CRM leads and bulk payroll.

The backend's OpenAPI document cannot safely generate clients without review.
It under-specifies bodies and errors and misidentifies methods/security for
important operations.

#### Remediation

- The legacy Store context, generic resource client, response adapters,
  synthetic CRUD database, and mutation forms were removed.
- Production business modules contain declared GET operations only.
- New management modules are declared as read-only endpoint/field catalogs.
- Raw response objects are not dumped into the UI.
- Pagination variants are normalized in the shared loading hook.
- Caller cancellation and request timeouts now operate together.
- Stale responses cannot replace newer query results.
- Request IDs and structured API errors remain available to the UI.
- Unsupported product domains are recorded in
  [`BACKEND_GAPS.md`](BACKEND_GAPS.md).

#### Residual risk

The live dashboard composes several independent endpoints rather than a single
snapshot, so its cards can have different freshness and partial authorization
failures. Catalog pages use server-side pagination and normalize only the known
backend envelopes. New envelopes require explicit tests rather than a generic
fallback.

#### Write-enable gate

No live mutation should be enabled until its operation has:

- a verified backend route and method;
- exact request/response/error DTO documentation;
- scope and permission tests;
- an endpoint-specific request adapter;
- idempotency or duplicate-submit handling where applicable;
- UI confirmation and pending-state behavior;
- cache/list invalidation tests;
- a real department-head smoke test;
- a rollback or correction workflow for money and approval changes.

### 4. Feature and page coverage

#### Original risk

The first console exposed a visually broad set of pages, but much of it was
seed-backed and several backend domains were missing entirely from management
navigation. That combination created both false functionality and omitted
functionality.

#### Remediation

The live console now includes 20 explicit read-only modules covering 104
collection/tab routes, 79 verified detail routes, and 17 selected-record related
routes. All 200 configured GET paths are unique. Coverage includes:

- current account and role memberships;
- people, guardians, students, teachers, employee accounts, and cohorts;
- organization, branch, and department structure;
- meetings, rooms, schedules, and substitutions;
- messaging directories and AI governance;
- attendance records;
- academic exams, grades, transcripts, and subjects;
- assignments and submissions;
- risk, branch, family, and teacher intelligence;
- approval requests and money ledger;
- invoices, expenses, refunds, cashier shifts, fees, and discounts;
- report library, runs, and schedules;
- notifications and templates;
- audit events;
- integration/webhook operations;
- rulebook and penalties;
- account types, assignments, and permission overrides.

Each module declares its visible fields, detail route, row identity, and
capability slug. Director-only areas remain separated from the department-head
manager surface.

Selected-record relations are loaded lazily rather than fanned out across every
row. They remount when the selected parent identity changes, use normalized
numeric pagination metadata, and keep their own server-side page state.

The live schema exposes 230 canonical GET paths. Thirty are intentionally not
generic management panels: five require mandatory query selectors, ten are
self-service views, eight are export/download/token workflows, four duplicate
or nest data already represented elsewhere, and three are unsafe or
misdocumented. Most importantly:

- `/api/v1/cards/wallets/{student_id}/` creates a wallet when none exists, so it
  is not a read-only GET and is excluded;
- achievement approve/reject paths are published as GET but the implementation
  accepts POST only and returns 405 to GET;
- selector-dependent summaries and file/receipt/feed operations require
  purpose-built controls rather than a generic list tab.

#### Not implemented as fake features

The following are intentionally not presented as complete backend products:

- consolidated CEO dashboard;
- full lead/CRM pipeline;
- payroll register or bulk payroll run;
- real-time chat-thread presence and delivery;
- self-discoverable effective manager grants.

These require backend work described in `BACKEND_GAPS.md`.

### 5. Layout, resilience, and accessibility

#### Original risk

The application had large page-specific layouts with inconsistent responsive
behavior, seed-backed modal mutation flows, and no top-level recovery boundary.
Important async views could appear empty or stale without distinguishing a
load, an error, or a genuinely empty result.

#### Remediation

The shared application shell and new module infrastructure now provide:

- a theme-adaptive sidebar as the persisted default and a full-width
  top-navigation shell as an optional saved preference;
- authenticated loading and denied-state boundaries;
- top-level rendering error recovery;
- explicit loading, empty, error, and retry states;
- abort-on-navigation and stale-response protection;
- stable view selectors instead of horizontal tab decks;
- full-width registers with accessible record actions and centered, focus-trapped
  detail dialogs instead of persistent right-side panes;
- responsive tables/cards and overflow containment;
- clearer navigation grouping and role-aware visibility;
- removal of the seed-backed modal mutation flows from production navigation;
- fade-only route changes, reduced-motion handling, and focus-visible styling;
- validated first-paint theme/palette hydration and WCAG-readable supporting
  text across all light and dark palettes;
- consistent design tokens and narrow-screen layout rules.

Manual browser QA confirmed that the redesigned dashboard remained within a
390-pixel viewport (`scrollWidth` equaled `clientWidth`) and expanded to a
long-form leadership workspace rather than an empty first screen. Desktop and
mobile catalog views use a full register or record cards respectively, while
details open in a centered desktop dialog or full-screen mobile dialog. CEO
navigation contained 22 entries; manager navigation contained 19 without
Organization, Finance, or Access. An ordinary accountant received the forbidden
state with no navigation. A paginated related section requested its own pages
without changing the parent register.

#### Residual risk

No automated browser accessibility or visual-regression suite exists yet.
Before public rollout, exercise the keyboard path at 320, 768, 1280, and
1920-pixel widths and run an automated accessibility scan plus manual screen
reader spot checks. The error boundary contains a render failure but no
privacy-reviewed browser telemetry sink is configured, so production incident
reporting must add one or supply an equivalent operator workflow.

The shell, sign-in flow, and Settings surface have matching English, Russian,
and Uzbek catalogs. The long dashboard and shared catalog presenter still
contain English operational copy. Treat those pages as English-only until their
remaining labels, states, and actions are added to all three catalogs; do not
market the entire console as fully localized yet.

### 6. Dependencies and deterministic builds

#### Original risk

The original Docker build used `npm install`, accepted an optional lockfile, and
used moving image tags. The repository had no declared package manager/runtime
contract and no production-audit gate.

#### Remediation

- Node is pinned to `22.23.1` for local/CI/container use.
- The release package manager is declared as npm `10.9.8`.
- `package-lock.json` is authoritative.
- CI and Docker use `npm ci`.
- The external Dockerfile parser frontend is pinned by version and digest.
- Container base images are pinned by exact tag and multi-architecture digest.
- Unused `react-router-dom` was removed.
- React, i18n, Vite, ESLint, hooks linting, and Vitest dependencies were brought
  to a mutually compatible reviewed set.
- `npm audit` and a production-only high-severity audit are release checks.
- Weekly Dependabot proposals cover npm, Docker bases, and GitHub Actions
  without bypassing review or CI.

Dependency updates are not automatic proof of safety. Renovation work still
needs change review, lockfile diff review, tests, and a live smoke test.

### 7. Tests and continuous integration

#### Original risk

There was no test runner, test file, coverage command, or CI workflow. A bundle
building successfully was the only repeatable check.

#### Remediation

The repository now includes:

- ESLint with React Hooks and Fast Refresh checks;
- Vitest for deterministic unit/contract tests;
- coverage generation;
- endpoint-catalog contract tests;
- regressions that keep side-effecting or falsely documented GET routes out of
  read-only panels;
- supported API collection-envelope normalization tests;
- auth and HTTP credential, error-envelope, 401-invalidation, and
  cancellation-versus-timeout tests, including rejection of nonempty non-JSON
  HTTP 200 responses;
- strict identity tests for inactive, revoked, wrong-kind, ordinary, and custom
  non-management principals;
- a composite local check command;
- read-only workflow permissions, commit-pinned actions, and checkout steps
  that do not persist the repository credential while project code executes;
- GitHub Actions jobs for clean install, lint, tests with coverage, live build,
  fixture-build rejection, production audit, artifact upload, image build,
  unsafe-upstream rejection, hardened container start, health check, and
  response-header smoke tests.

#### Residual risk

The current tests are a meaningful infrastructure baseline, not comprehensive
product coverage. In particular, collection normalization is tested while the
rendered hook loading/retry/stale-response transitions are not. Missing suites
include:

- auth-provider login/logout/session-expiry integration;
- role-to-navigation matrix;
- each new module's actual tenant presenter shape;
- detail selection and keyboard interaction;
- responsive browser snapshots;
- full browser login and critical read-only journeys;
- backend/console contract tests executed together.

Add an include-all coverage policy and reviewed non-regression thresholds only
after the missing component/browser suites make those numbers representative.

### 8. Container and HTTP runtime

#### Original risk

The old image:

- ran the official Nginx image with its default root user;
- listened on privileged port 80;
- used a writable root filesystem;
- installed with `npm install`;
- used moving `node:22-alpine`, `nginx:1.27-alpine`, and `:latest` tags;
- had no same-origin backend proxy;
- set no CSP, frame, content-type, privacy, or indexing headers;
- did not separate a lightweight health endpoint from the SPA;
- could cache application-shell behavior ambiguously.

#### Remediation

The current runtime:

- builds from a Node/Alpine tag pinned to its multi-architecture digest;
- serves from an Nginx/Alpine tag pinned to its multi-architecture digest;
- runs as the unprivileged `nginx` user;
- listens on port 8080;
- supports a read-only root filesystem;
- uses a small `/tmp` tmpfs for Nginx runtime data;
- drops all Linux capabilities;
- bounds the container process count;
- enables `no-new-privileges`;
- uses a dedicated `/healthz`;
- validates the entire `API_UPSTREAM` value as one HTTPS origin, rejecting
  credentials, control characters, paths, trailing slashes, and ports outside
  1-65535 before template rendering;
- proxies `/api/` and `/ws/` to the configured HTTPS tenant;
- enables upstream TLS SNI, certificate-chain verification, and TLS 1.2+;
- applies request timeouts and forwarded metadata;
- sets CSP, frame denial, no-sniff, no-referrer, permissions, opener, and
  no-index headers;
- forces `no-store` on proxied management API responses;
- long-caches hashed assets while disabling shell caching;
- sends query-free, correlation-aware access logs and errors to stdout/stderr.

#### Trust-boundary note

TLS termination and HSTS belong at the external HTTPS ingress. The container
cannot safely emit HSTS when it does not own the public TLS boundary. The edge
must also prevent clients from spoofing trusted forwarding headers.

#### Local validation limit

Docker/Nginx are not installed in the audit workstation environment. Their
configuration is therefore checked by the CI image-build and container-smoke
job rather than claimed as locally executed.

The current workflow does not generate an SBOM, scan the complete image, or
sign/publish its digest. The production registry pipeline must supply those
controls before promotion.

### 9. Repository and operational hygiene

Added controls include:

- `.gitignore` for dependencies, builds, coverage, test output, local
  environments, uploads, IDE files, and logs;
- `.dockerignore` to keep Git history, local environments, docs, test output,
  dependencies, and uploads out of the build context;
- `.gitattributes` for predictable text and binary handling;
- `.editorconfig` for consistent encoding, line endings, and indentation;
- `.nvmrc` for the supported local Node runtime;
- a single root README and focused `docs/` ledgers.

The cleanup removes tracked duplicate screenshots and stale integration reports.
Those deletions are intentional and recoverable from Git history.

## Production acceptance gates

Every gate below must pass for the exact release commit and image digest.

### Automated gate

Run from a clean checkout:

```powershell
npm ci --no-fund
npm run lint
npm run test:coverage
$env:VITE_API_URL = ''
$env:VITE_USE_MOCK = 'false'
npm run build
npm audit
npm run audit:production
git diff --check
```

GitHub Actions must also:

1. build the Docker image;
2. prove fixture-enabled production builds are rejected;
3. prove newline/directive injection and invalid upstream ports are rejected;
4. start the hardened image with a real `API_UPSTREAM`;
5. receive 200 from `/healthz`;
6. receive the expected shell cache/security headers;
7. preserve an `/api/` request through the proxy;
8. upload the exact `dist` and coverage artifacts.

### Live schema-contract gate

Run `npm run validate:schema` against the intended tenant immediately before
promotion. It must report all 200 configured GET routes with zero missing or
duplicate routes. This is deliberately a manual release gate rather than a CI
job: CI must not become nondeterministic when the external tenant is unavailable
or being deployed independently.

### Identity and authorization gate

- Director login resolves to CEO.
- Department-head login resolves to manager.
- Ordinary and custom staff memberships are refused.
- Teacher, parent, and student login is refused by this console.
- An expired credential returns to login without retaining tenant data.
- Direct API calls still return 403 when the principal lacks capability.
- No account can elevate itself through URL, local storage, or Vite variables.

### Functional smoke gate

For both director and department head:

- load the dashboard and identify any partial metric failures;
- open every visible navigation page;
- page, search, retry, and open one detail record in each new backend module;
- select records with related panels, change the parent selection, and paginate
  at least one related collection without stale child data;
- confirm empty datasets look empty rather than broken;
- confirm a denied dataset looks denied rather than empty;
- verify all money, percentage, date, and status formats against raw responses;
- confirm logout and session expiry clear protected content;
- confirm no live business-mutation control or generic CRUD request exists.

### Responsive and accessibility gate

- keyboard-only login, navigation, detail selection, retry, pagination, and
  logout;
- visible focus and no keyboard trap;
- screen-reader labels for icon-only controls;
- no clipped primary action at 320, 768, 1280, or 1920 pixels;
- 200% browser zoom without loss of core operation;
- reduced-motion preference respected;
- automated accessibility scan with no critical or serious violations.

### Deployment gate

- deploy by immutable image digest, never `latest`;
- generate an SBOM, scan the final image, and sign/attest its digest;
- set `API_UPSTREAM` to the intended tenant HTTPS origin with no path or
  trailing slash;
- terminate TLS at the managed edge and enable HSTS there;
- restrict the console to intended operators/network policy;
- restrict container egress to the intended API origin and required DNS;
- verify CSP against any actual production font/asset hosts;
- configure log aggregation and alerts for 401, 403, 429, 5xx, and health;
- document rollback to the previous image digest;
- retain backend and frontend request IDs in incident workflows;
- run the smoke gate after deployment and after rollback practice.

## Rollback and incident readiness

The frontend image is stateless; rollback should replace the image digest while
keeping the tenant API unchanged. Do not roll back by enabling fixture mode.

For an incident:

1. capture timestamp, user role, tenant, route, and frontend request ID;
2. correlate the ID in Nginx/edge/backend logs;
3. classify 401/403 as identity or scope before treating it as missing data;
4. disable or hide a faulty read surface rather than substituting fixture data;
5. do not enable generic live writes as an emergency workaround;
6. roll back the immutable image when the console is the regression source;
7. record any backend-contract mismatch in `BACKEND_GAPS.md` with executable
   evidence and closure criteria.

## Explicit non-claims

This remediation does not claim:

- that the current OpenAPI file is an exact executable contract;
- that a department-head manager can discover every effective grant;
- that the dashboard has a consistent server-side snapshot;
- that lead cards constitute a CRM;
- that payroll rows constitute an authoritative payroll run;
- that chat has real-time thread delivery or true presence;
- that read-only views make unverified backend mutations safe;
- that every schema-advertised GET is safe, side-effect-free, or suitable as a
  generic management tab;
- that a successful unit test replaces a live constrained-role smoke test;
- that local source inspection validates the external TLS/ingress configuration.

Production readiness is achieved only when the acceptance gates pass for the
release artifact and the residual backend/product limitations are consciously
accepted by the owner.
