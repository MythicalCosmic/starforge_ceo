# Backend product requirements for the leadership workspace

Status: implementation contract and production gate
Prepared: 2026-08-01
Frontend: `starforge_ceo`
Backend: `starforge_edu`, working branch `codex/permission-audit-release`

This document records the backend work still required to make the rebuilt CEO
and branch workspaces authoritative. The interface deliberately shows an
unavailable or partial state where the service cannot prove scope, freshness,
or attribution. It must not fill those gaps with invented values.

## Completed in the current backend worktree

These changes are implemented and tested locally, but remain release work until
they are reviewed, committed, migrated where necessary, and deployed from an
approved revision.

- Student `gender` and public teacher-profile filters now resolve the correct
  fields. Student rows include readable branch and current-group names.
- Teacher compensation is omitted from normal directory responses and requires
  finance visibility. Payout-policy writes require both teacher and finance
  authority.
- Teacher directories now apply strict active-state, exact subject,
  compensation-profile, and inclusive hire-date filters before pagination.
  Compensation filters require finance visibility and return the same generic
  denial for valid and invalid guesses, avoiding a salary-information oracle.
- Approval requests and ledger entries now intersect the caller's exact branch
  memberships. Cross-branch detail, approval, rejection, cancellation, and
  disbursement return not-found responses. Ambiguous branch inference is
  rejected.
- Invoice, payment, expense, and refund registers now accept a strict positive
  `branch` filter and inclusive `date_from` / `date_to` values in
  `YYYY-MM-DD` form. The filters are applied after authorization scope and
  malformed or reversed input returns a field-scoped 400 response.
- Cash collection now locks the invoice while calculating its allocated value,
  rejects non-positive, closed-invoice, and overpayment attempts, and preserves
  exact idempotent retries. Concurrent receipts cannot push an invoice above
  its outstanding balance, and an omitted amount means the remaining balance.
- Invoice lists now omit nested lines and allocations, calculate
  `outstanding_uzs` in one correlated aggregate, and retain full nested detail
  only on record/create responses. Draft, void, and paid invoices report zero
  outstanding.
- Role-membership responses retain stable branch and department identifiers and
  now include readable `branch_name` and `department_name` values, with related
  identity rows eagerly loaded.
- `GET /api/v1/users/me/` now returns a deterministic effective-permission set
  plus organization-wide or branch/department scope records. Revoked
  memberships and inactive account types are excluded, wildcard grants are
  safely reduced by explicit revocations, and each scope includes its own
  effective permissions. The response also exposes the authoritative
  organization locale and primary currency without guessing a timezone from an
  arbitrary branch.
- Same-origin browser authentication now uses an additive cookie transport:
  `GET /api/v1/auth/session/` establishes CSRF state, role login moves the
  opaque key into a host-only HttpOnly SameSite cookie and omits it from JSON,
  and unsafe cookie-authenticated requests require the matching CSRF header.
  Production defaults to a Secure `__Host-` cookie; local HTTP development uses
  a separate non-Secure name. Existing Bearer clients remain supported and an
  explicit Bearer header takes precedence over a browser cookie.
- Production acceptance requires the `__Host-` session cookie to use
  `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain`; successful
  role login and password change rotate the credential to prevent session
  fixation. The DEBUG-only HTTP cookie must remain host-only, `HttpOnly`,
  `SameSite=Lax`, and `Path=/`, and must never be enabled by a production
  setting. Auth and identity responses use `Cache-Control: no-store`, never
  redirect, and never place an access, refresh, or session key in JSON.
- The browser currently supplies Django's `csrftoken` cookie as `X-CSRFToken`
  after the login-time masked token is used. That CSRF cookie is deliberately
  JavaScript-readable because it is not an authentication credential; it must
  still be host-only, `Secure` in production, `SameSite=Lax`, and `Path=/`.
  Renaming it or making it `HttpOnly` requires an additive endpoint that returns
  a fresh masked token after every CSRF rotation and a coordinated frontend
  contract change before deployment.
- Current-session and all-session logout are separate, idempotent operations.
  Both remove the browser cookie, while current-session logout revokes only the
  credential used for that request. Browser-cookie, CSRF-failure, cross-tab,
  revocation, and Bearer-compatibility behavior has focused regression coverage.
- Browser-cookie requests now follow the same three-stage rate-limit contract
  as Bearer requests: every request pays the pre-authentication IP bucket,
  credential-present traffic is not double-charged to the anonymous bucket,
  and only a successfully authenticated session receives the tenant/user
  bucket. Rotating invalid cookies remain bounded by the pre-authentication
  limit; browser traffic is not exempted.
- Same-origin WebSocket handshakes can authenticate from the HttpOnly session
  cookie, so browser JavaScript never needs to reconstruct a Bearer subprotocol
  or query-string credential. Explicit Bearer subprotocols retain precedence
  for native clients. Ambient-cookie handshakes are accepted only when the
  browser Origin exactly matches the target origin or an explicitly configured
  trusted origin, preventing cross-site WebSocket hijacking. Production keeps
  query-token fallback disabled, and live sockets continue to revalidate
  revocation on each heartbeat.
- The DEBUG-only CEO dataset now creates the role-native `admin` / `root`
  account without staff or superuser authority, keeps its bridge password
  unusable, and safely moves the older tenant Django administrator to
  `admin.django` when necessary. The seed is idempotent and includes several
  months of attendance evidence for the group workspace.
- User directory lists and details now intersect the exact active membership
  that grants `users:read`. Department and multi-branch unions are preserved,
  revoked or inactive responsibilities contribute no scope, out-of-scope
  details return not-found, and collection rows use a reduced identity shape.
- Printing jobs, printers, and branch connections now use the exact active
  `printing:read` or `printing:write` scope before pagination and detail lookup.
  Ordinary responses omit storage locations, internal failure text, token
  material, connection metadata, and arbitrary printer capability JSON.
- Student directories no longer repeat emergency contacts, enrollment-hold
  reasons, password state, or sign-in activity. Student enum filters and
  joined/age ranges reject invalid or reversed values rather than returning a
  misleading empty register.
- Finance-filter verification: 19 focused tests, 228 finance/payment tests, and
  34 shared listing/input-hardening tests passed. Approval and related workflow
  suites also passed during the scope-hardening pass.
- The cash, invoice, membership, and identity follow-up passed 60 combined
  finance/access/payment tests, 10 concurrency/idempotency checks, 9 staff and
  self-profile regressions, Ruff, and diff integrity checks.
- The full teacher-domain suite passed 38 tests, including pre-pagination
  totals, inclusive bounds, cross-branch scope, strict validation, and
  compensation-filter privacy.
- The final sequential authorization pass covered user-directory scope,
  effective-permission bootstrap, print-operation scope/redaction, and student
  directory/filter hardening: 71 tests passed without parallel test-database
  interference.

## P0 — required before CEO production use

### 1. Finish the session and organization-time bootstrap

The authorization, cookie transport, scope, locale, and currency portions of
the browser bootstrap are now authoritative. Complete the remaining
organization-time and session-state fields on `GET /api/v1/users/me/` so the
browser does not need to infer either value:

```json
{
  "read_only_session": false,
  "organization_timezone": "Asia/Tashkent"
}
```

The model currently stores timezone per branch and has no organization-wide
source of truth; add one rather than choosing an arbitrary campus. Expose
`read_only_session` from an enforceable session policy. Permission and
membership revocation already affect the next request rather than only the next
login.

### 2. Preserve historical branch attribution

Invoices and payments are currently branch-filtered through present-day
student, group, allocation, account, or cashier relationships. A later student
transfer can therefore move historical money between branches.

Add immutable, indexed `branch_at_issue` / `branch_at_payment` ownership (and
the equivalent department snapshot where required). Populate it at creation
inside the same transaction. Backfill old rows into a reviewed state; do not
silently guess ambiguous history. Registers, reports, and comparisons must use
the snapshot, while current placement remains a separately named field.

Historical approval requests with a null branch also require a reviewed
backfill. Until resolved, scoped handlers should continue to hide them rather
than infer ownership.

### 3. Make audit activity branch-safe

Audit rows need an immutable branch/department scope snapshot derived at write
time. Audit list, detail, and export must intersect that snapshot with
`audit:read` memberships and return 404 outside scope. Do not reconstruct
ownership from a resource's current branch. The branch workspace intentionally
keeps Activity history closed until this is guaranteed.

### 4. Publish one permission-pruned executive snapshot

Add an aggregate operation such as:

`GET /api/v1/intelligence/executive-summary/?branch=&department=&date_from=&date_to=`

Local release-candidate status on 2026-08-02: the permission-pruned operation,
closed query contract, exact scope resolution, shared `generated_at`, student
totals, attendance denominator, branch student/attendance aggregates, immutable
finance attribution, structured coverage/warnings, 30–60 second private cache,
ETag revalidation, bounded query-count tests, and explicit OpenAPI schemas are
implemented in `starforge_edu`. The CEO overview now consumes this snapshot for
its headline measures before loading row-level drill-down registers. Production
remains unchanged until the backend revision is deployed.

The richer series, retention/capacity/risk breakdowns, teacher-delivery section,
operating queues, and exact per-branch finance comparison described below remain
additive follow-up requirements; the client must not invent them from a bounded
page of directory rows.

It should provide, under one `generated_at`, scope, and date window:

- student totals, joins, exits, ungrouped learners, levels, locations, risk,
  attendance, retention, and capacity;
- branch comparisons with sample size and metric definitions;
- teacher delivery, attendance, students reached, group load, and assessment
  evidence without claiming causal employee performance;
- billed, collected, outstanding, overdue, refunded, approved expense, paid
  expense, and cash-reconciliation values;
- pending approvals, unread leadership updates, upcoming meetings, and other
  actionable exceptions.

The branch portion must support an exact focal-versus-comparator response with
students, teachers, active groups, capacity, attendance numerator/denominator,
published-assessment coverage, billed, collected, outstanding, overdue,
refunds, and paid/approved expenses. Include current and comparison-period
values plus stable metric definitions. Provide daily or weekly finance and
attendance series when the requested window has enough observations; do not
force a smooth trend from a few monthly anchors. Teacher attribution for money
must remain absent until the backend can prove a safe business relationship.

Omit a section when the caller lacks its permission; never replace it with
zero. Return structured `coverage` and `warnings`. Validate every requested
scope against the caller's grants. Cache for 30–60 seconds by tenant, exact
scope, permission set, and filter window, and support ETag revalidation.

### 5. Separate compensation authority from faculty authority

Introduce an explicit compensation permission rather than relying forever on
the broad `finance:read` grant. Salary, payout policy, bonuses, deductions, and
loan offsets must never appear in faculty directory rows.

Bonuses and deductions require an append-only adjustment ledger with amount,
currency, effective period, reason, creator, approver, state, timestamps, and
an idempotency key. Mutations need separation of duties, approval-state checks,
audit events, and branch scope. Never implement salary changes as an
unattributed overwrite of the current rate.

### 6. Protect published assessment and grade integrity

The current academic contract permits a published exam to be edited, moved,
deleted, or regraded without a correction workflow. It can also leave computed
grades stale after result, weighting, publication, or deletion changes. Before
academic results are used for executive decisions:

- lock published exam identity, group, subject, term, maximum score, and weight;
  corrections require a reason, version, actor, timestamp, and an auditable
  republish transition;
- prevent lowering a maximum below an existing score and prevent moving an exam
  away from students with recorded results;
- recompute or explicitly invalidate affected grades transactionally whenever
  results or exam semantics change;
- require a readiness summary before publication (eligible, graded, missing,
  excluded, and sample coverage), plus an explicit confirmation/version check;
- restrict organization-wide subject and exam-type changes to an appropriate
  catalogue-management permission rather than the default teacher write grant;
- make CSV validation identical to JSON validation for precision, finite
  values, score range, and note length, and reduce the upload ceiling to a size
  appropriate for 5,000 rows;
- return stable public student codes in result responses and provide a visible
  correction history instead of unattributed overwrites.

## P1 — complete the product contracts

### Students

Provide a leadership-profile aggregate for a single student, either as an
additive detail shape or a dedicated endpoint. It should return only permitted
sections and include readable relationships rather than forcing the browser to
join unrelated registers:

- identity and enrollment: public student ID, username, name, photo, status,
  branch, group, level, joined/enrollment/graduation/exit dates and reason;
- learning: primary and additional teachers, subjects, recent grade, grade
  trend, assignments due/completed/late, exams, transcript summary;
- attendance: period counts, rate with explicit unit, streak, last attendance,
  and per-group breakdown;
- family and safeguarding: guardians, relationship, verified contact methods,
  pickup permissions, emergency contact, and consent flags under separate
  permissions;
- finance: fee schedule, invoices, paid, outstanding, overdue, discounts,
  refunds, and last payment under finance authority;
- record metadata: created/updated people and timestamps, block state/reason,
  custom fields, `generated_at`, and section-level coverage.

Return `primary_teacher_id` and `primary_teacher_name` (plus any additional
teacher assignments) directly in the permitted student leadership detail. The
current browser can only infer the primary teacher by joining a capped group
register, so it correctly withholds that link whenever group coverage is not
complete.

Server filters should cover search, branch, group, teacher, ungrouped,
enrollment status, level, origin/location, gender, hold/block state, joined
range, graduation/exit range, and age range. Unknown filter names should not be
silently ignored. Reversed date and numeric ranges must return a field-scoped
400 response instead of quietly presenting an empty register.

### Teachers

Add a scoped workload snapshot with readable branch/department, subjects,
active group count and names, unique student count, timetable load, rooms,
attendance/delivery evidence, assessment evidence, leave/availability, and the
measurement window/sample size. Keep profile edits and compensation writes as
separate operations with separate permissions and audit events.

Directory and detail responses should expose authoritative
`current_group_count`, `current_student_count`, and compact assignment links.
The current interface derives these only when both the group and student
registers are complete within their 100-row bounds; it must not present a
partial client join as an authoritative workload total.

### Groups

Add a group operating snapshot that returns group, branch, teachers, room,
schedule, capacity, active students, attendance summary, assignments, exams,
billing coverage, and `generated_at` under one scope. A read-only attendance
matrix operation should accept an inclusive period, paginate students, and
return explicit session columns so large groups do not require one request per
student. Include export support with the exact applied filters. Attendance
registers must implement declared branch and teacher filters (or reject them)
rather than silently ignoring a leadership scope parameter.

The group directory itself must add exact `level` and `teacher` filters before
pagination and return an authoritative `current_student_count` (plus occupancy
when capacity is known) on each permitted row. Until those fields are deployed,
the browser keeps teacher/level filtering disabled for results larger than its
100-row evidence window and leaves occupancy blank when the related student
register is incomplete; it must not turn one loaded page into an organization-
wide conclusion.

### Exams, subjects, and exam types

Add a direct branch filter to exam registers rather than requiring a browser
join through groups. Subject and exam-type CRUD must validate duplicate names,
protect referenced records, enforce scoped academic permissions, and emit
audits. Exam create/edit/publish/delete and grade entry need documented state
transitions, idempotency where retry can duplicate work, and conflict responses
for invalid transitions.

Add exam search and inclusive date, branch, department, and teacher filters;
add result filters and grade branch/group/teacher filters. Unknown query names
must be rejected on these decision-critical registers. Exam detail should
include creator and update timestamps, branch/department, eligible candidate
count, graded/missing counts, coverage, average/median/range, and the configured
pass threshold. Result entry and CSV import should return the public student
code alongside the internal relationship so leadership can reconcile errors.
Grade rows should also return `exam_id`, `exam_title`, and `term_name` alongside
their existing subject and term identifiers, allowing every published outcome
to deep-link to the assessment that produced it.

### Finance

Keep the newly implemented strict branch/date filters and add readable,
permission-safe relationships to details:

- invoice: student, guardian/payer, group, fee reason, branch-at-issue, creator,
  lines, discounts, allocations, refunds, and remaining balance;
- payment: invoice allocations, student/guardian, cashier, branch-at-payment,
  provider, receipt, reconciliation state, and retry history;
- expense: branch, category, requester, approver, payment/disbursement state,
  supporting document action, and ledger connection;
- refund: invoice, payment, student, requester, approver, reason, provider
  transition, and completion evidence.

Provide asynchronous XLSX/PDF export using the exact server-side filter
contract, record the export in the audit trail, expire download links, and
prevent spreadsheet-formula injection. Print output must use the same scope and
filters as the screen.

### Profile, notifications, and sessions

Expose supported profile fields and validation in the schema. Store language,
theme, density, navigation preference, notification channel matrix, digest
frequency, quiet hours, and timezone as typed preferences. Device/session rows
should contain a stable session ID, approximate device/browser, created time,
last activity, current-session marker, and revocation action. Password and
sensitive-profile changes require reauthentication where policy demands it.

### StarAI production contract

The current StarAI workspace is explicitly a local, session-only demonstration
grounded in records already visible to the signed-in user. A production
assistant requires server-side conversations, message streaming, citations to
authorized records, scope and filter metadata per answer, retention controls,
prompt-injection defenses, rate limits, audit events, and permission checks at
retrieval time. Never place unrestricted tenant data or hidden fields into a
model prompt.

The local backend's proposed AI request privacy migration is not assumed to be
deployed. Its mandatory all-tenant preflight, non-rolling maintenance boundary,
irreversible-retention handling, and activation evidence are specified in
[BACKEND_AI_PRIVACY_CUTOVER_REQUIREMENTS_2026-08-02.md](./BACKEND_AI_PRIVACY_CUTOVER_REQUIREMENTS_2026-08-02.md).

## Contract conventions

- Use one canonical paginated envelope with `count`, `next`, `previous`, and
  results, plus `generated_at`, applied filters, scope, and warnings where a
  view is aggregated.
- Reject malformed known filters with field-scoped 400 responses. Prefer
  rejecting unknown filters on decision-critical registers so a misspelling
  cannot quietly show a broader result.
- Define money once. Prefer integer minor units plus ISO-4217 currency, or keep
  the current decimal-major UZS fields until a versioned migration; never
  silently reinterpret existing values.
- A money field that is present must be finite and valid in that versioned
  representation. Required invoice, allocation, payment, refund, expense, and
  balance amounts must not arrive as `null`, an empty string, `NaN`, or an
  unparseable value. When an amount is legitimately unavailable, return an
  explicit availability reason and mark every dependent aggregate incomplete;
  never ask a client to infer that the missing amount is zero.
- Name rates by unit: `_fraction` means 0–1 and `_pct` means 0–100. Include
  numerator, denominator, and sample window for management metrics.
- Use ISO-8601 timestamps with offsets and ISO dates for date-only fields.
  Aggregate date boundaries use the organization's IANA timezone.
- Return stable public identifiers and readable names together. Do not expose
  storage keys, internal bridge IDs, credentials, or sensitive notes merely to
  save a lookup.
- Mutation errors use stable codes and field errors. Retry-sensitive writes use
  idempotency keys. Out-of-scope object IDs return 404.

## Performance and reliability gates

- Add composite indexes for the final scope/date predicates, especially
  immutable branch plus issue/paid/created date, group plus attendance date,
  teacher assignments, and active membership scope.
- Bound every comparison and timeline operation in SQL. Avoid materializing a
  tenant-wide queryset before sorting or slicing.
- Prevent N+1 queries with reviewed `select_related` / `prefetch_related`
  plans. Add query-count regression tests for the executive snapshot and detail
  aggregates.
- Support conditional requests and short-lived scoped caches. Cache keys must
  include tenant, permissions, branch/department scope, filters, and locale.
- Return a structured partial response only for truly optional panels. Core
  financial or authorization failure must not become a successful zero.
- Publish readiness separately from liveness and run synthetic sign-in,
  dashboard, branch isolation, payment idempotency, and export checks before a
  release is promoted.

## Acceptance gates

1. OpenAPI and presenter snapshots cover every field and filter above.
2. Director, single-branch manager, multi-branch manager, finance-only, and
   faculty-only accounts pass navigation plus direct-URL tests.
3. Cross-branch list, detail, mutation, export, audit, printing, finance, and AI
   retrieval tests prove that explicit filters only narrow authority.
4. Historical money and audit backfills report resolved, unresolved, and
   quarantined counts; no ambiguous row is silently assigned.
5. Performance tests use production-like branch/student volumes and publish
   p50/p95 query count, service time, and payload size.
6. The frontend schema validator and end-to-end suite run against the exact
   immutable backend revision selected for deployment.
