# StarForge EDU CEO / Manager Console

This repository contains the browser-based management console for StarForge
EDU. It is a React 18 and Vite 6 single-page application for authenticated
CEOs and managers only.

The application is live-first: local preview data is disabled by default, every
production Vite build rejects preview mode, and live identity is established
through role login and the current-user endpoint. Commit
[416f607](https://github.com/MythicalCosmic/starforge_edu/commit/416f607ba9b0a70f54b24f030c76462b2f74f00a)
is the historical compatibility baseline. The evolving companion worktree has
been inspected as an implementation reference, while the files in `docs/`
remain the required production contract. Neither local code nor documentation
is deployment evidence; production integration waits for the backend owner's
immutable-release confirmation.

This does **not** mean that every visible workflow is writable or that every
requested management feature exists. Read the current
[backend product requirements](docs/BACKEND_PRODUCT_REQUIREMENTS_2026-08-01.md)
before release; the earlier audits remain historical baselines.

## Support boundary

- The frontend labels the two presentation modes `ceo` and `manager`.
- In the backend, CEO access maps to an active `director` membership.
- Manager access maps only to an active `head_of_dept` membership.
- The backend's `principal_kind: "staff"` value is a broad technical identity
  category, not this product's audience definition. Ordinary and custom staff
  memberships are rejected.
- The backend remains the authorization authority. Navigation visibility is a
  usability boundary, never a permission boundary.
- Parent, student, teacher, ordinary staff, custom staff, and every other
  non-CEO/non-manager principal are rejected even with valid credentials.
- There is no Flutter application in this repository.

## Implemented surfaces

The complete management catalog is available again through 24 visible CEO
destinations. Overview, Branches, Students, Teachers, Groups, Exams, Finance,
and StarAI are dedicated decision workspaces; the restored supporting domains
cover people, academic records, placement, recognition, scheduling,
organization, operations, decisions, content, intelligence, reporting,
activity history, engagement, messaging, responsible AI, and access. Account
and preferences remain utility routes rather than competing with daily work.

Department managers receive the complete set of scoped operating domains, but
the organization-wide directory, Finance, and Access & roles remain
director-only by default. When `effective_permissions` is present on the
current-user response, navigation and tabs are reduced further to match the
session's actual grants. The backend remains authoritative for every request.

All 112 catalog views are route-backed. Student and teacher records use focused
full-page profiles instead of stacked dialogs; broad workspaces retain setup,
reference, and supporting views under horizontally scrollable tabs. Former
module hashes and record links resolve to the matching clean route without
discarding their record identifier.

The read-only contract inventory in `src/api/catalog.js` contains 22 domains,
112 collection GETs, 83 detail GETs, and 26 selected-record relations—221 unique
configured reads. Lists stay service-paginated and related information loads
only for the selected record.

The catalog intentionally excludes selector-bound aggregates, exports and
signed-download routes, and every state-changing action. For example, the CRM
funnel requires an explicit bounded date window, while payroll run, approval,
reconciliation, export, and download operations require dedicated workflows.
See [Backend gaps](docs/BACKEND_GAPS.md) for the route-by-route disposition.

The old Store, mock CRUD database, generic resource client, response adapters,
and presentation-only mutation forms have been removed. Production pages use
explicit GET endpoints and declared response fields. CRM and payroll write
operations remain outside this generic catalog; do not recreate them with
browser-local state or generic writes.

## Requirements

- Node.js `22.23.1` (the version in `.nvmrc`) or a supported Node 24 release.
- npm `10.9.8` or a compatible npm 11 release.
- Docker with Compose v2 for the container workflow.
- A real management account in the target tenant for live verification.

Install the exact locked dependencies:

```powershell
npm ci
```

## Local development

Copy the environment template and start Vite:

```powershell
Copy-Item .env.example .env.local
npm run dev
```

To connect this checkout to the currently verified live tenant, set `.env.local`
to:

```dotenv
VITE_API_URL=
VITE_API_PROXY_TARGET=https://starforge.78.111.91.113.nip.io
VITE_USE_MOCK=false
```

With an empty browser-facing API URL, Vite proxies `/api/*` to the HTTPS tenant
host. This keeps requests same-origin in the browser and avoids weakening the
backend's production CORS policy for local development. The loopback-only proxy
also aligns browser `Origin` and `Referer` headers with that validated upstream,
so Django's normal cookie/CSRF checks remain active during a local live login.

Open `http://127.0.0.1:5173`, sign in with a real director or department-head
account, and verify the tenant and role shown by the shell.

### Fast ngrok preview

Do not tunnel `npm run dev`: Vite development mode serves the application as
many individual source modules, so tunnel latency is multiplied across the
initial page load. Stop the development server, run the optimized build on the
same port, and point ngrok at port 5173:

```bash
npm run tunnel
ngrok http 5173
```

The preview server retains the validated `/api/*` proxy from `.env.local` and
accepts rotating `*.ngrok-free.app` tunnel names.

### Netlify deployment

`netlify.toml` pins `npm run build`, publishes `dist`, caches content-hashed
assets, preserves the SPA fallback, and proxies same-origin `/api/*` requests
to the currently verified tenant. Push the file and trigger a fresh Netlify
deploy; an old deploy will not receive these routing rules automatically.

Netlify is suitable for the current REST console, but its rewrite proxy is not
a replacement for the Nginx image when WebSocket-backed features are enabled.

### Local companion backend

`npm run validate:schema` checks the current live contract without authenticating
or mutating data. For isolated development data, use the matching companion
checkout at `../starforge_edu` and its Docker development stack:

```bash
cd ../starforge_edu
docker compose -f docker/docker-compose.yml up -d postgres redis minio
docker compose -f docker/docker-compose.yml build web
docker compose -f docker/docker-compose.yml run --rm web migrate
docker compose -f docker/docker-compose.yml run --rm web python scripts/seed_dev.py
docker compose -f docker/docker-compose.yml run --rm web python scripts/seed_ceo_console.py
docker compose -f docker/docker-compose.yml up -d web
```

Point this console at the tenant host in `.env.local`:

```dotenv
VITE_API_URL=
VITE_API_PROXY_TARGET=http://demo.localhost:8000
VITE_USE_MOCK=false
VITE_DEV_HOST=127.0.0.1
```

Start Vite and open `http://127.0.0.1:5173` (or `http://demo.localhost:5173`). The role-native local CEO
account is `admin` with password `root`. This intentionally weak, memorable pair is a
development credential only; the Django administrators documented in the
backend repository are intentionally separate and cannot sign in to this
console. These credentials exist only after the confirmed matching seed has
been run; they must never be enabled in production. The seed is designed to be
safe to rerun and not delete unrelated tenant data, but it must still be used
only against a disposable local tenant.

### Backend-off design preview

When the backend is unavailable, run the local-only design preview:

```dotenv
VITE_USE_MOCK=true
VITE_ROLE=ceo
```

Then start `npm run dev`. The preview skips sign-in and supplies deterministic,
read-only examples for the executive overview, branch comparison, students,
teachers, groups, four months of attendance, exams and results, enrollment and
risk signals, invoices, payments, expenses, family contacts, decisions, tasks,
meetings, content, and printing relationships. Unprepared areas render an
honest empty state with a preview notice. It has no persistent record store,
mutation layer, authorization proof, or production-contract value, and it
makes no business-data request to a live tenant.

Use `?role=manager` to inspect the conservative manager navigation and
`?read_only=true` to inspect restricted-session UI. These URL switches work
only in the Vite development server with preview mode explicitly enabled.
Every production build rejects `VITE_USE_MOCK=true`; live role, scope, and
session policy always come from `/api/v1/users/me/`.

Never put a session key, password, API key, or other credential in a `VITE_*`
variable. Vite values are public bundle content. The browser session key is
issued only into a host-only HttpOnly cookie and is never returned to, or
stored by, browser JavaScript.

## Authentication flow

1. `GET /api/v1/auth/session/` to establish the same-origin CSRF cookie and
   obtain its masked request token.
2. `POST /api/v1/auth/role-login/` with username, password, platform, a
   per-tab device identifier, cookie-transport intent, and the CSRF header.
3. Accept the opaque session only through the backend's host-only HttpOnly
   cookie; the login JSON contains no access key.
4. `GET /api/v1/users/me/` in every new tab.
5. Treat `principal_kind: "staff"` only as a technical precondition, then
   require exactly `director` for CEO or `head_of_dept` for manager.
6. Require password change when the backend marks the account accordingly.
7. Clear private caches and local UI state after a 401 or logout; non-secret
   storage events synchronize already-open tabs without copying credentials.
8. Treat logout as complete only after the service confirms revocation and
   cookie expiry. If that request fails, keep protected data cleared but show an
   explicit unconfirmed-session warning and retry action.

The hardened companion response exposes deterministic effective permissions,
branch/department scopes, readable membership names, organization locale,
organization timezone, primary currency, and the server-enforced read-only
session state directly from `/users/me/`. The console applies the locale and
timezone to business dates, uses the presentation currency only for
currency-neutral values, and preserves explicit response currencies such as
finance v1's `_uzs` ledger fields. It removes mutation controls for restricted
sessions and also blocks unsafe requests locally while the backend remains
authoritative.

## Data loading and cache

All dashboard, collection, and record-detail reads use TanStack Query. Query
keys include language, path, and normalized parameters, so identical views share
in-flight work without mixing pages or translations. Successful reads stay
fresh for 45 seconds and remain reusable for five minutes; transient 5xx
failures receive one retry. Reconnect and window focus refresh stale data.
Changing identity, signing out, or receiving an authenticated 401 clears the
entire query cache so one session's records cannot reach another.

The executive overview requests one permission-pruned aggregate snapshot for
its exact headline totals, then starts row-heavy drill-down registers after the
snapshot settles. Three compatibility reads remain dormant unless an older
backend genuinely lacks the aggregate operation, so frontend and backend can be
deployed in either order without duplicating normal traffic.

Route bundles load lazily. Hover, focus, and navigation intent warm only the
owning route chunk on suitable connections; reduced-data, 2G, and offline
clients skip this optional work. The large supporting-management chunk is no
longer downloaded merely because an authenticated session became idle.
Production assets are content-hashed. Use `npm run analyze` when a bundle
change needs review; it creates `dist/bundle-report.html` without enabling
source maps.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run lint` | Run ESLint with zero warnings allowed |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run tests and generate V8 coverage |
| `npm run validate:schema` | Compare every configured GET route with `STARFORGE_SCHEMA_URL` (the live tenant by default) |
| `npm run build` | Build the static production bundle |
| `npm run analyze` | Build and write an interactive treemap to `dist/bundle-report.html` |
| `npm run preview` | Serve a built bundle locally |
| `npm run audit:all` | Audit application and build dependencies at high severity |
| `npm run audit:production` | Audit shipped dependencies at high severity |
| `npm run check` | Run lint, tests, and build sequentially |

The current 2026-08-02 frontend-only snapshot passed `npm run check` with zero
lint warnings, 38 test files and 319 passing tests, and a 176-module production
build. Coverage is 57.36% statements, 57.25% branches, 49.43% functions, and
60.24% lines. Both dependency audits report zero known vulnerabilities;
signature verification found 217 signed packages and 69 provenance
attestations. A deterministic-preview browser sweep passed 94 unique routes at
desktop and phone widths (188 cases), followed by nine focused interaction
checks. The local route-settle sample measured 118 ms median and 124 ms p95; it
is a local preview responsiveness signal, not a production latency claim. These
are frontend checks, not proof that the evolving backend requirements are
deployed; see the
[current hardening audit](docs/PRODUCT_HARDENING_AUDIT_2026-07-31.md) for bundle
sizes, scope, and remaining release gates.

CI runs locked installation, lint, coverage, a live-mode build, the production
dependency audit, and a hardened container smoke test. Dependabot proposes
reviewable npm, Docker-base, and GitHub Actions updates each week; it does not
bypass the CI or live-smoke gates.

`npm run validate:schema` is an intentional manual live-contract gate. It is
not part of CI because it depends on the availability and current deployment
state of an external tenant.

## Container deployment

The image pins the Dockerfile frontend, Node 22 build image, and Nginx Alpine
runtime by tag and multi-architecture digest, installs with `npm ci`, refuses
`VITE_USE_MOCK` values other than `false`, and runs Nginx as the unprivileged
`nginx` user on port 8080.

Set `API_UPSTREAM` to one HTTPS origin (host and optional port only, with no
path or trailing slash):

```powershell
$env:API_UPSTREAM = "https://starforge.78.111.91.113.nip.io"
docker compose up --build
```

Open `http://localhost:8080`.

For production, set `CONSOLE_IMAGE` to the verified registry digest and run
Compose without rebuilding that artifact. `CONSOLE_PORT` changes only the
host-side listener.

The runtime:

- proxies `/api/*` and `/ws/*` to `API_UPSTREAM`;
- verifies the upstream HTTPS certificate and allows only TLS 1.2 or newer;
- preserves tenant routing by forwarding the configured upstream host;
- forwards request IP and a sanitized original-scheme value;
- uses a read-only root filesystem and a bounded `/tmp` tmpfs;
- keeps release assets root-owned and read-only to the serving worker;
- drops Linux capabilities, bounds process count, and enables
  `no-new-privileges`;
- serves content-hashed assets with long caching;
- prevents caching of `index.html` and every SPA fallback;
- forces `no-store` on proxied management and WebSocket responses, including
  errors;
- emits CSP, clickjacking, MIME-sniffing, referrer, permissions, opener, and
  search-engine exclusion headers;
- logs request paths, latency, and correlation IDs without query strings or
  credentials;
- provides `/healthz` for container health checks.

The container listens on plain HTTP because TLS is expected at the production
edge. The edge proxy must terminate HTTPS, forward the original scheme, and set
HSTS. Do not expose the container port directly to the public internet.

## Repository layout

```text
.
|-- .github/
|   |-- dependabot.yml
|   `-- workflows/ci.yml
|-- docs/
|   |-- BACKEND_AI_PRIVACY_CUTOVER_REQUIREMENTS_2026-08-02.md
|   |-- BACKEND_PRODUCT_REQUIREMENTS_2026-08-01.md
|   |-- BACKEND_RELEASE_ACTIONS.md
|   |-- BACKEND_GAPS.md
|   |-- DESIGN_FOUNDATION_V1.md
|   |-- PRODUCT_HARDENING_AUDIT_2026-07-31.md
|   `-- PRODUCTION_READINESS_AUDIT.md
|-- public/
|-- src/
|   |-- api/
|   |-- components/
|   |-- config/
|   |-- context/
|   |-- hooks/
|   |-- pages/
|   `-- styles/
|-- Dockerfile
|-- docker-entrypoint.sh
|-- docker-compose.yml
|-- nginx.conf
|-- package.json
`-- vite.config.js
```

The application lives directly at the Git root. Generated dependencies,
bundles, coverage, local environment files, test artifacts, and pasted uploads
or temporary visual references are intentionally ignored.

## Release checklist

Before promoting an image:

1. Run `npm ci`.
2. Run `npm run lint`.
3. Run `npm run test:coverage`.
4. Set `STARFORGE_SCHEMA_URL` to the exact pinned candidate's `/api/schema/`
   endpoint and run `npm run validate:schema`.
5. Run `npm run build` with `VITE_USE_MOCK=false`.
6. Run `npm run audit:production`.
7. Build and start the image with the intended `API_UPSTREAM`.
8. Scan the final image, generate its SBOM, and record/sign its immutable
   digest in the deployment system.
9. Verify `/healthz`, security headers, and no-cache `index.html`.
10. Verify backend role-login, mandatory password change, `/users/me/`, logout,
   and 401 invalidation.
11. Verify director and department-head navigation with real accounts.
12. Verify one paginated list from each enabled backend module.
13. Verify the edge routes both HTTPS and WSS, supplies HSTS, strips inbound
    forwarding headers, and sets the authoritative public scheme and host.
14. Review unresolved P0/P1 items in the audit documents and
    `docs/BACKEND_RELEASE_ACTIONS.md`.

Do not promote a release based only on a successful Vite compilation.
