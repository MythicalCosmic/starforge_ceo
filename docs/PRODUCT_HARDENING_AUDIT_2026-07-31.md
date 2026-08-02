# StarForge Leadership Workspace Hardening Audit

> Current frontend verification snapshot: 2026-08-02. This document retains the
> original 2026-07-31 findings, but its implemented-frontend descriptions and
> verification counts have been updated to the current worktree. It is not
> deployment evidence. Backend production gates remain authoritative in
> [BACKEND_PRODUCT_REQUIREMENTS_2026-08-01.md](./BACKEND_PRODUCT_REQUIREMENTS_2026-08-01.md)
> and [BACKEND_RELEASE_ACTIONS.md](./BACKEND_RELEASE_ACTIONS.md).

Audit date: 2026-07-31

Frontend: `starforge_ceo`

Original backend audit reference: `MythicalCosmic/starforge_edu` at
`416f607ba9b0a70f54b24f030c76462b2f74f00a`
(`codex/permission-audit-release`). The backend now under development is a
concurrent candidate, not an immutable production revision; it must be frozen,
re-audited, migrated, and accepted before deployment.

## Decision

The frontend is now a materially safer, faster, and more coherent release
candidate. It must not be described as bug-free or fully production-ready until
the backend release gates in [BACKEND_RELEASE_ACTIONS.md](./BACKEND_RELEASE_ACTIONS.md)
are closed and real director and scoped-manager accounts pass end-to-end
acceptance testing.

The former interface exposed an endpoint-shaped information architecture,
opened important records in transient dialogs, relied on optimistic role
assumptions, produced misleading empty states when connectivity failed, and
contained substantial unreachable presentation code. The new interface is
organized around leadership decisions and durable, bookmarkable pages.

## Critical findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| P0 | The backend user directory can expose tenant-wide identity and membership data to a scoped manager. | Candidate backend code has exact permission-bearing scope, reduced list rows, not-found cross-scope detail, and regression coverage. Production closure is unconfirmed until the approved revision passes cross-scope acceptance. |
| P0 | `/users/me/` does not yet provide a complete, authoritative permission, scope, locale, timezone, and currency bootstrap. | The candidate supplies permission, scope, locale, and currency evidence; organization timezone and session read-only state remain release-contract gates. |
| P0 | Compensation-related teacher information can cross a normal staff-directory boundary. | Candidate controls finance-gate directory compensation and require faculty plus finance authority for payout writes. A dedicated compensation permission and production authorization tests remain recommended. |
| P0 | Important backend actions, logout scope, error bodies, and advertised OpenAPI behavior are inconsistent. | Exact backend contract and acceptance tests are specified in `BACKEND_RELEASE_ACTIONS.md`. |
| P1 | Important records were transient dialog state, so refresh, Back/Forward, copy-link, and new-tab behavior failed. | Replaced with routed full-page registers and profiles. Navigation elements are real anchors. |
| P1 | Connection failures could look like a legitimate zero, empty register, or endless skeleton. | Existing data remains visible as stale, first-load failure is explicit, paused/offline queries terminate loading states, and retry remains available. |
| P1 | Legacy role fallbacks could broaden the interface when a malformed permission array was returned. | Missing legacy payload retains compatibility; a present malformed payload fails closed. Unit coverage includes malformed and multi-scope cases. |
| P1 | Browser-locale dates, times, percentages, and money could change meaning between executive devices. | Central formatting uses English and Asia/Tashkent until the organization bootstrap supplies the authoritative locale, timezone, currency, and units. |
| P1 | Authentication data persisted too broadly and one tab could retain protected cached information after another tab signed out. | The browser no longer stores or sends a bearer token. It uses the shared same-origin HttpOnly cookie, rehydrates each tab through `/users/me/`, clears query/private preview state on auth transitions and 401, and synchronizes sign-in/sign-out with non-secret storage events. Production cookie attributes and expiry behavior still require backend acceptance. |
| P1 | Request paths admitted parser edge cases that could escape the intended management route family. | Transport now accepts only normalized `/api/v1/` paths and rejects protocol-relative, credentialed, backslash, control-character, malformed-escape, and traversal forms. |
| P1 | Mixed English, Uzbek, and Russian core views presented an unfinished product. | The selector is intentionally limited to complete English while RU/UZ resources remain staged. Full localization is a future acceptance gate. |
| P2 | The dashboard duplicated information and rendered weakly prioritized panels. | Rebuilt as a dense, filterable executive view of money, students, teaching, branch comparison, capacity, attendance, risk, and actionable exceptions with explicit coverage. |
| P1 | Consolidating the catalog made 46 of 104 valid views, 36 detail routes, and four related panels unreachable. | Restored all 20 catalog domains and all 104 views under grouped leadership navigation; legacy record links now preserve their identifiers. |
| P1 | One legacy access grant without a role-native profile caused the complete Responsibilities collection to fail with 409. | Candidate backend behavior retains the auditable grant with a nullable profile reference and an explicit unavailable flag; authorization and scope are unchanged. Production confirmation remains part of the contract gate. |
| P2 | Students and teachers were generic tables with modal details. | Rebuilt as focused registers with responsive cards and dedicated profile routes. Sensitive teacher sections are capability-gated. |
| P2 | Tables and navigation had keyboard, focus, contrast, and touch-target defects. | Restored visible scroll-region focus, corrected warning text contrast, made closed mobile navigation unfocusable, and enlarged the mobile search input target. |
| P2 | Approximately 1,780 lines of obsolete CSS and three unreachable React exports remained. | Removed after a selector-to-rendered-markup audit; lint, tests, and production build remained clean. |

## Information architecture

The current interface uses dedicated, lazy-loaded full-page workspaces for
Overview, Branches, Students, Teachers, Groups, Exams, Finance, and StarAI.
Students, teachers, groups, exams, invoices, and branch records use durable hash
routes rather than transient modal state; refresh, Back/Forward, copy-link, and
new-tab navigation therefore retain the active page or record. Branch selection
enters a nested branch workspace with its own scoped navigation while preserving
a clear route back to the organization view.

The broad management catalog remains available under grouped leadership
navigation instead of being deleted. A scoped manager receives only the
operating domains allowed by the identity bootstrap; organization-wide
directory, Finance, and Access & roles remain capability-dependent. Account
preferences and reference views stay inside their owning workspace rather than
competing with daily operations.

## Data and state behavior

- TanStack Query owns request deduplication, cancellation, stale retention,
  reconnect/focus refresh, bounded garbage collection, and one retry for
  transient 5xx reads.
- Primary directory and finance filters, server page number, active tab, and
  selected-record state are represented in the URL. Invalid pages are corrected
  to a canonical in-range URL when response metadata identifies the last page.
- Selected records use a list-row seed for instant transition, then reconcile
  with the authoritative detail response.
- A row without a stable backend identifier cannot synthesize a fake route; the
  interface explains that details are unavailable.
- Paginated registers distinguish the exact server-reported total from the rows
  loaded on the current page. Cards, client-side breakdowns, and downloads are
  not represented as full-register evidence when only one page is present.
- Exact executive headlines come from the permission-pruned summary contract;
  bounded detail registers are labelled as loaded or partial evidence. Missing
  or unavailable information is displayed as unknown, not invented as zero.
- Dashboard filter values are length-bounded, type-checked, and allowlisted
  before they enter requests or canonical URL state. This is defensive UX and
  request hygiene, not a substitute for backend validation and authorization.
- Filtered exports use the active register state and disclose their loaded-page
  scope rather than silently implying a complete organization extract.
- Fixture mode is development-only, visibly labelled, role-scoped, and rejected
  by production builds.

## Security boundary

The browser interface does not replace backend authorization. Hiding a page is
only a usability and privacy measure; every backend queryset and operation must
enforce the same permission and scope boundary.

Completed frontend controls include:

- a CSRF bootstrap followed by cookie-transport login; browser requests send
  same-origin cookies and never add an `Authorization: Bearer` header;
- no authentication credential in `localStorage` or `sessionStorage`, plus
  deletion of credentials left by older bundles;
- non-secret cross-tab sign-in and sign-out epoch signals: a new tab validates
  the shared cookie through `/users/me/`, while sign-out and 401 clear protected
  query caches and session-only preview data across tabs;
- failed sign-out never claims the opaque session was revoked: protected local
  state is cleared immediately, the user sees an explicit unconfirmed-session
  warning, and a retry remains available because browser JavaScript cannot
  expire an HttpOnly cookie;
- Django CSRF cookie/header protection on unsafe requests, bounded request
  timeouts, typed failures, request correlation, and strict management-path
  validation;
- same-origin production requests and a validated loopback-only HTTP
  development proxy;
- hardened container origin validation, an unprivileged read-only runtime, and
  restrictive response headers;
- HTTPS-only external document links without embedded credentials;
- production fixture rejection and no source maps;
- stable, non-technical error copy that does not disclose transport internals.

Open security decisions:

1. The approved production backend must prove the authentication cookie is
   host-only, `Secure`, `HttpOnly`, appropriately `SameSite`, scoped to the
   minimum path, rotated after login/password change, and expired by logout.
   Trusted-origin and CSRF rejection tests must run from the real deployment
   origin. The frontend cannot verify flags on an HttpOnly cookie.
2. Idle and maximum-session policy requires backend expiry metadata, a genuine
   reauthentication or step-up flow, and current-session logout. A cosmetic
   cover that merely repeats `/users/me/` would not prove the same person is
   present, so an arbitrary frontend-only timer was not introduced.
3. External document links now identify their destination host, but their
   origins should eventually be restricted by an organization-approved
   allowlist supplied by the trusted bootstrap contract.
4. The current Content Security Policy still permits inline styles because a
   small number of components use dynamic style attributes. Removing those
   attributes would allow a stricter style policy.
5. `/healthz` is frontend liveness. Production operations also need a separate
   backend readiness or authenticated synthetic check.

## Performance result

The app uses route-level lazy loading for every dedicated workspace and the
broader management catalog. It does not blanket-download the catalog during
browser idle time. Pointer hover, keyboard focus, search-result intent, and
navigation prefetch only the selected route; requests are deduplicated, failed
prefetches can retry during normal navigation, and optional prefetch is skipped
while offline, under Data Saver, or on a reported 2G connection. Nested branch
records prefetch only the branch shell and the relevant delegated workspace.

Current local production output from the verification run below:

| Asset | Raw | Gzip |
| --- | ---: | ---: |
| Initial JavaScript | 367.02 KB | 114.59 KB |
| StarAI workspace JavaScript | 18.63 KB | 6.17 KB |
| Executive dashboard JavaScript | 29.05 KB | 9.50 KB |
| Teachers workspace JavaScript | 31.11 KB | 8.89 KB |
| Students workspace JavaScript | 31.19 KB | 8.99 KB |
| Exams workspace JavaScript | 42.61 KB | 11.71 KB |
| Groups workspace JavaScript | 52.51 KB | 14.38 KB |
| Finance workspace JavaScript | 57.74 KB | 14.20 KB |
| Branches workspace JavaScript | 76.38 KB | 19.72 KB |
| Restored management catalog JavaScript | 102.66 KB | 25.18 KB |

The intent-only loading policy avoids automatically downloading the 102.66 KB
raw / 25.18 KB gzip management-catalog chunk for sessions that never express
intent to open a catalog route. The current build transformed 176 modules. No
production service-level result was established by this source, bundle, and
local-browser verification.

The scoped executive-summary operation is now implemented locally and consumed
by the overview. One cached, permission-pruned request supplies the exact
student, attendance, and money headlines; row-heavy chart registers start only
after that snapshot settles. This removes the separate student-statistics,
payment, and expense bootstrap reads, reduces connection contention, and keeps
bounded pages from masquerading as complete organization totals. Specialized
registers remain intentionally separate for interactive drill-down charts.

`react-window` is intentionally not installed. Current registers are
server-paginated or capped at 100 linked rows, so virtualization would add
focus, measurement, and responsive-layout complexity without a measured
rendering bottleneck. Reconsider it only if a future design deliberately
supports hundreds of simultaneously rendered rows.

## Verification record

| Check | Result |
| --- | --- |
| ESLint | Passed with zero warnings |
| Vitest | 38 files, 319 tests passed |
| Coverage | 57.36% statements (3,799/6,622), 57.25% branches (5,409/9,447), 49.43% functions (1,086/2,197), 60.24% lines (3,284/5,451) |
| Production build | Passed; 176 modules transformed |
| Bundle output | Passed; exact raw and gzip sizes are recorded above |
| Bundle analyzer | Passed; the interactive treemap was generated without source maps |
| Dependency audits | `npm run audit:all` and `npm run audit:production` passed with zero known vulnerabilities |
| Dependency signatures | Passed; 217 signed packages and 69 provenance attestations verified |
| Live schema snapshot | Passed read-only validation: 342 paths, 524 operations, 20 modules, 104 tabs, 200 configured GET paths, no missing GETs, and no duplicates |
| Broad rendered-browser sweep | Passed 94 unique routes at desktop and phone widths: 188 route/viewport cases with zero detected issues |
| Targeted interaction QA | Passed nine dashboard, chart, branch comparison, filter, StarAI, relationship-link, and mobile navigation scenarios |
| Local route-settle sample | 118 ms median, 124 ms p95, 127 ms maximum; deterministic local preview only |
| Hardened image smoke | Passed at 26,545,201 bytes with UID/GID 101, read-only root, dropped capabilities, no-new-privileges, bounded PIDs, root-owned assets, no source maps, security headers, private-path no-store, and immutable assets |
| Source whitespace check | Passed |

The 319 frontend regressions are strongest around transport, cookie-session
authentication, cross-tab invalidation, roles, routing, URL pagination,
formatting, fixtures, caching, strict hostile dashboard-filter normalization,
missing-money evidence states, data-coverage language, and presentation
contracts. The local rendered-browser sweep found no blank/error-boundary page,
generic document title, root horizontal overflow, runtime or console error,
duplicate ID, unnamed visible control/table/dialog, raw underscored service
state, technical placeholder wording, missing image alternative, or excessive
DOM in its 188 cases. These checks used deterministic design-preview data. The
schema snapshot was read-only and observed a moving tenant. Cookie
authentication, authorization, live data, and container-to-service behavior
were not rerun against an approved immutable backend and are not presented as
current production evidence.

## Remaining release gates

1. Reconcile the concurrent backend candidate, close its documented failed
   focused tests and migration blockers, freeze one immutable revision, and run
   the executable contract suite against the exact release image. No current
   migration or local frontend result proves production deployment.
2. Exercise one real director and at least one multi-scope department head,
   including attempts to open out-of-scope list and detail identifiers.
3. Promote the targeted local rendered-browser sweeps into durable CI coverage
   for authenticated direct URLs, Back/Forward, offline/stale behavior, 401
   invalidation, keyboard-only navigation, axe checks, and the five reference
   viewport widths.
4. Confirm money units, timezone, currency, fraction/percent semantics, and
   names from the organization bootstrap rather than environment assumptions.
5. Deploy backend readiness and authenticated synthetic monitoring alongside
   the already verified frontend-liveness check.
6. Obtain product approval for session idle, maximum lifetime, and step-up
   authentication policy.
