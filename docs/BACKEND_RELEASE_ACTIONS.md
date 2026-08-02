# Backend Release Actions for the CEO / Manager Console

> Update, 2026-08-01: the broader product contract and current implementation
> status now live in
> [BACKEND_PRODUCT_REQUIREMENTS_2026-08-01.md](./BACKEND_PRODUCT_REQUIREMENTS_2026-08-01.md).
> This document remains useful as the original security evidence, but items
> marked as open here must be reconciled with the newer tested worktree changes.

Status: release-blocking contract

## 2026-08-02 active-backend handoff: do not deploy the local candidate

The backend is currently being changed outside this console workspace. At the
owner's request, further backend mutations and migration execution stopped on
2026-08-02. The backend worktree reviewed during this pass is an uncommitted,
concurrent candidate, not a production artifact. Requirements below must be
reconciled by the backend owner and rerun against one immutable revision before
the console is promoted.

No migration in this section was applied to production or to an owner-managed
development tenant during this audit. A read-only migration-plan attempt against
an empty scratch database stopped because that database did not contain the
public `tenancy_center` table; it did not modify any database.

### Candidate workflow-attribution migration order

The current candidate graph resolves the relevant leaves in this order:

1. `teachers.0010_alter_payoutpolicy_method`
2. `students.0011_protect_identity_history`
3. `org.0019_centersettings_organization_timezone`
4. `parents.0010_preserve_family_lifecycle_history`
5. `org.0020_org_scope_and_history_integrity`
6. `org.0021_durable_center_settings`
7. `ai_app.0015_ai_request_scope_privacy`
8. `forms_app.0003_role_principal_attribution`
9. `meetings.0002_attendee_principal_attribution`
10. `messaging.0006_threadparticipant_principal_attribution`
11. `notifications.0012_recipient_principal_attribution`
12. `staff_tasks.0003_task_assignee_principal`

This is graph evidence from the active local candidate only. Recompute
`migrate --plan` from the exact release image after all backend branches merge;
do not hard-code this order in deployment scripts.

### Canonical AI privacy cutover (`ai_app.0015`)

Only one `0015` leaf may exist. The reviewed canonical filename is
`0015_ai_request_scope_privacy.py`; the conflicting
`0015_secure_request_attribution.py` candidate was removed before this handoff.
No later migration currently declares either name as a dependency.

The intended cutover contract is:

- Legacy role attribution is always `unresolved`. The migration must never infer
  an exact student, teacher, parent, or staff principal from a shared bridge
  user or from current placement.
- A resolved request must carry a live exact principal at capture time, a
  nonblank authorization permission, and a scope status of `organization` or
  `resolved`. An unresolved request must carry no principal, permission, branch,
  or department authority and must have `scope_status=unresolved`.
- Requester identity, captured scope, source, prompt, idempotency identity,
  parameter fingerprint, permission, and retention deadline are immutable in
  PostgreSQL. Provider receipt is write-once. Accounting/status updates and
  explicit sensitive-content purge remain possible. Accounting evidence is
  append-only.
- The requester relation uses `PROTECT`; production should deactivate an account
  instead of deleting identity history.
- Migration work is keyset-paginated by primary key in batches of 500 and uses
  the migration connection alias. Logs contain aggregate counts only—never
  tenant schema names, row IDs, prompts, outputs, redaction maps, or ciphertext.
- Content retention is based on historical `created_at + 30 days`. Unexpired
  legacy output is written through the authenticated encrypted field and read
  back successfully before the plaintext column is blanked. Expired output and
  redaction maps are purged and receive a purge timestamp.
- Legacy `queued` or `running` requests and negative provider-cost rows block the
  cutover. The migration does not guess how to finish, cancel, or repair them.
- The content cutover is deliberately irreversible. `RunPython` has no reverse
  handler: a rollback must raise instead of silently restoring protected output
  to plaintext or dropping ciphertext fields. Expired content is intentionally
  unrecoverable after purge.

Required deployment sequence:

1. Freeze the approved Git revision and build the deploy image from it.
2. Take a full encrypted backup and complete a restore rehearsal. Record the
   backup identifier, revision, tenant count, encryption-key version, and restore
   result in the change ticket.
3. Run the release preflight read-only. It may report only aggregate totals for
   all AI requests, nonblank plaintext, already-expired content, negative costs,
   and nonterminal (`queued`/`running`) work. It must never print row identifiers
   or content. Require an explicit operator acknowledgement of the irreversible
   privacy boundary.
4. Stop producers and drain workers. The gate must show zero queued/running rows
   and zero negative-cost rows. Repair discrepancies through an audited business
   procedure, then rerun the preflight.
5. Apply the reviewed dependency graph tenant by tenant from the same image. Do
   not run this migration during an ordinary rolling deploy with old application
   nodes still writing plaintext.
6. Verify aggregate row counts, zero plaintext, authenticated ciphertext reads
   for retained samples, expired-content purge counts, immutable-trigger behavior,
   and exact-principal isolation. Do not log sampled values.
7. Run the focused and global acceptance suites, then resume producers/workers.
   Roll forward on application defects. Restore the approved backup for a true
   data/schema rollback; do not attempt a normal reverse migration across 0015.

### Verification completed before the stop boundary

The following checks passed against the concurrent candidate before backend
edits were stopped:

- Django system check: zero issues.
- `makemigrations --check --dry-run` for forms, meetings, messaging,
  notifications, tasks, and the canonical AI migration: no model-state drift.
- Targeted Ruff for the workflow and AI files: passed.
- Targeted mypy for the AI package/task/provider paths: passed after relation
  nullability was made fail-closed and model-specific locals replaced an unsafe
  reused variable.
- A fresh-database focused workflow run collected 73 outcomes: 61 passed,
  11 failed, and 1 teardown error in 113.81 seconds. This is a failed release
  gate; the failures below remain open.

### Remaining focused failures—must not be waived

| Test / area | Observed failure | Required disposition |
| --- | --- | --- |
| Forms shared bridge | `test_shared_bridge_principals_do_not_share_form_target_or_dedupe_identity` used a staff role that also had form-management visibility, so the negative audience assertion was invalid. | Rebuild the fixture with a genuinely responder-only non-manager account and prove the staff principal cannot inherit the teacher-targeted audience. Keep manager visibility as a separate positive test. |
| Meetings cross-scope cancellation | `test_invited_manager_cannot_cancel_another_branch_or_centre_wide_meeting` sent a legacy bridge-user invite that became ambiguous and returned 400 before setup. | Use the explicit role-native invite selector. Retain a separate assertion that an ambiguous legacy selector fails closed. |
| Task creation | `test_hierarchy_gated_assignment` rejected the legacy assignee selector as `Invalid assignee`. | Verify one-principal legacy compatibility for genuinely unambiguous users, while requiring the exact `{kind,id}` selector for shared bridges. Do not restore user-ID union authorization. |
| Task row locking | `test_reassign_is_hierarchy_gated` raised PostgreSQL `FOR UPDATE cannot be applied to the nullable side of an outer join`. | Lock the base task row in a first query, then load nullable related display data separately. Add a PostgreSQL regression. |
| Task hierarchy | `test_ungraded_target_fails_closed_when_hierarchy_configured` failed in the same focused run. | Re-run alone after the lock and selector fixes; preserve its fail-closed hierarchy behavior. |
| Task assignment detail | `test_assign_action_and_detail_happy_path` failed in the same focused run. | Convert setup to an explicit principal or repair only the unambiguous adapter, then assert readable assignee/branch/department fields. |
| Archived-branch task behavior | `test_single_archived_branch_is_not_auto_selected` failed in the same focused run. | Re-run alone and preserve the rule that an archived scope is never silently selected. |
| Workflow report presenter assertion | `test_workflow_attribution_report_counts_resolved_and_review_rows` asserted that a payload built from the resolved task had no assignee. | Correct the test variable so the assertion inspects the quarantined task; do not hide valid resolved attribution. |
| Workflow wrong-owner probe | `test_workflow_report_rejects_wrong_owner_and_inactive_principal_pairs` tried to disable and re-enable the form trigger while deferred trigger events were pending. PostgreSQL rejected the re-enable. | Build corruption evidence in an isolated autocommit/migration-state fixture, restore the trigger reliably, and prove the checker rejects a shape-valid wrong owner. Never leave a trigger disabled after a failed test. |
| Notification command schema option | `test_backfill_defaults_to_dry_run` passed one schema string, which was treated as an iterable of characters (`_, a, e, n, t`). | Normalize programmatic `schema="tenant_a"` and CLI repeated-schema lists into one validated list. Add both invocation forms. |
| Notification cross-batch fixture | `test_backfill_cross_batch_duplicates_match_review_and_apply` attempted two quarantined rows with the same existing `(user_id,dedupe_key)` and hit `notif_quarantine_dedupe_unique` before the command ran. | Test batch-size independence with a representable legacy identity conflict or against the pre-constraint migration state. Do not weaken quarantine uniqueness to make the fixture pass. |
| Notification teardown | `test_explicit_empty_channel_whitelist_creates_no_delivery` passed its body but teardown found an `audit_auditlog.actor_id` pointing to a user already removed. | Trace signal/on-commit audit creation and transaction ordering. Prove an explicit empty channel list creates no delivery without leaving deferred cross-test foreign-key damage. Do not suppress constraint checks or audit signals. |

Additional gates not completed after the stop boundary:

- No focused AI migration upgrade/irreversibility test was run after the
  canonical 0015 consolidation.
- No direct-SQL regression yet proves the final cross-status constraint,
  insert-time owner/department validation, immutable attribution, write-once
  provider receipt, append-only deletion, and requester `PROTECT` lifecycle.
- No migration was applied to a real tenant, and no production-like backup/
  restore rehearsal was performed.
- The global backend suite, global mypy/Ruff/Bandit gates, production settings
  boot, OpenAPI contract gate, and full frontend-against-backend E2E must be run
  from the final immutable release image after external backend work lands.

These are release blockers, not optional cleanup. The frontend must continue to
treat unresolved/quarantined workflow rows as unavailable rather than anonymous,
unassigned, or organization-wide.

Audit date: 2026-07-31

Backend repository: MythicalCosmic/starforge_edu

Verified source: codex/permission-audit-release at full commit
416f607ba9b0a70f54b24f030c76462b2f74f00a

This is the backend action contract for the management console. It is based on
the verified release commit above, not the unfinished default master branch. It
complements [BACKEND_GAPS.md](./BACKEND_GAPS.md): that file records audit
evidence; this file records the changes and acceptance gates required for a
release.

## Release decision

Do not deploy the backend from an unqualified branch name. Build and test from
the full verified commit until a reviewed successor commit closes the items in
this document.

- Record the full Git revision in the container image metadata and deployment
  manifest.
- Fail the release job if git rev-parse HEAD is not the approved revision.
- Run migrations and contract tests from the same immutable image that will be
  deployed.
- Promote a newer revision only after the acceptance suite below passes and the
  frontend schema validation is run against that exact image.
- Do not deploy the current default master; its routes, authentication, data
  models, migrations, permissions, and error format are materially different.

## P0: security and contract fixes

### 1. Scope the user directory and minimize PII

GET /api/v1/users/ and GET /api/v1/users/{id}/ currently require users:read but
query the whole tenant. A department head can therefore read people and
memberships outside their assigned branches or departments.

Required behavior:

- Apply permission-bearing membership scope to both list and detail queries.
- A director with tenant-wide access may see the tenant; a scoped manager may
  see only people in the union of that manager's active scopes.
- Return 404, rather than revealing existence through 403, for an ID outside
  the caller's visible queryset.
- Exclude unrelated role memberships and unnecessary contact/identity fields
  from directory rows. Keep full self data on /users/me/.
- Implement the advertised search behavior over explicitly allowed identity
  fields; it is currently ignored by the directory view.
- Resolve authorization only from active memberships applicable to the
  authenticated principal kind. Revocation must take effect immediately.

Primary backend evidence:
apps/users/views/v1/users_views.py:184-204,
apps/users/presenters.py:49-78, and core/permissions.py:614-680.

### 2. Make /users/me/ the complete authorization bootstrap

Navigation and data access must not be inferred from director or head_of_dept
slugs. AccountType grants are configurable and can differ by tenant and
membership. Extend the existing response without removing its current fields:

~~~json
{
  "success": true,
  "data": {
    "id": 42,
    "principal_kind": "staff",
    "full_name": "Amina Karimova",
    "must_change_password": false,
    "read_only_session": false,
    "organization_timezone": "Asia/Tashkent",
    "primary_currency": "UZS",
    "effective_permissions": [
      "students:read",
      "teachers:read",
      "reports:read"
    ],
    "role_memberships": [
      {
        "id": 9,
        "account_type": 3,
        "account_type_slug": "head_of_dept",
        "account_type_name": "Department head",
        "account_kind": "staff",
        "branch": 2,
        "branch_name": "Central Campus",
        "department": 5,
        "department_name": "Languages"
      }
    ],
    "scopes": [
      {
        "branch": { "id": 2, "name": "Central Campus" },
        "department": { "id": 5, "name": "Languages" },
        "effective_permissions": ["students:read", "teachers:read"]
      }
    ]
  }
}
~~~

Contract rules:

- effective_permissions is the union for the current authenticated session;
  scopes[].effective_permissions explains where each grant applies.
- Return only the caller's own effective grants. This endpoint must not require
  administrative access:read.
- Include human-readable branch and department names so the console never needs
  to display raw IDs or make lookup requests during bootstrap.
- organization_timezone is an IANA time-zone name and primary_currency is an
  ISO 4217 code. They are the presentation defaults for every leadership view;
  clients must not silently substitute the travelling user's browser zone.
- Keep arrays present when empty. Do not use null for permission or scope
  collections.
- read_only_session reflects impersonation or restricted-session state.

### 3. Repair student filters and make rows presentation-ready

Keep the canonical paginated envelope for GET /api/v1/students/. Add these
fields to every list and detail row:

~~~json
{
  "branch": 2,
  "branch_name": "Central Campus",
  "current_cohort": 14,
  "current_cohort_name": "IELTS Evening A"
}
~~~

Required fixes:

- Change the gender filter from user__gender to the role-native student profile
  field gender.
- Define teacher as a public TeacherProfile.id and resolve it as such; do not
  pass that value as the hidden bridge User.id.
- Keep medical notes absent from collection responses and permission-gated on
  detail responses.
- Preserve server-side search, status, branch, cohort, blocked, enrollment-date,
  and age filters with typed validation.
- Optimize /students/stats/ using conditional aggregation. Its current
  implementation performs five queries while its contract comment claims
  three.
- Add generated_at and the applied named scope to the statistics response so
  cards cannot imply mismatched freshness or organizational coverage.

Primary evidence: apps/students/filters.py:23-48,
apps/students/presenters.py:29-68, and
apps/students/selectors.py:273-303.

### 4. Separate teacher identity from sensitive compensation

GET /api/v1/teachers/ should remain a fast identity and organization listing.
Its rows must include stable readable fields:

~~~json
{
  "branch": 2,
  "branch_name": "Central Campus",
  "department": 5,
  "department_name": "Languages",
  "subjects": "English, IELTS",
  "qualifications": "CELTA; MA Applied Linguistics"
}
~~~

Required behavior:

- Treat qualifications as a string in the current API because the verified
  model stores a TextField. A future structured qualification model must use a
  versioned or additive migration rather than silently changing the type.
- Do not return salary_type, rate, payout policy, or other compensation data
  solely because the caller has teachers:read. Require the established
  finance:read permission (or a separately reviewed compensation permission)
  and omit those fields otherwise.
- Use /api/v1/intelligence/teachers/ for management metrics. Add branch and
  department IDs/names and an explicit measurement window to each metric row.
- Paginate and limit the teacher intelligence query in the database before
  materializing rows; the verified implementation builds and sorts the entire
  scoped population before slicing.
- Keep the metric definition transparent: attendance rate, delivered lessons,
  students reached, sample size, and window. Do not label this as causal
  employee “performance.”

Primary evidence: apps/teachers/presenters.py:25-63,
apps/teachers/models.py:84-86, and
apps/intelligence/selectors.py:482-535.

### 5. Publish the implemented executive summary

Implemented in the local backend release candidate; deploy and migrate it before
enabling the corresponding production frontend revision:

GET /api/v1/intelligence/executive-summary/?branch=&department=&date_from=&date_to=

The response must be one permission-pruned snapshot, not a proxy that issues
HTTP calls to the backend's own endpoints:

~~~json
{
  "success": true,
  "data": {
    "generated_at": "2026-07-31T10:00:00Z",
    "scope": {
      "branches": [{ "id": 2, "name": "Central Campus" }],
      "departments": [{ "id": 5, "name": "Languages" }]
    },
    "students": {
      "total": 720,
      "active": 681,
      "leads": 24,
      "blocked": 3,
      "with_cohort": 664
    },
    "branches": [
      {
        "id": 2,
        "name": "Central Campus",
        "student_count": 420,
        "attendance_rate_fraction": 0.942,
        "at_risk_count": 11
      }
    ],
    "attention": {
      "at_risk_students": 16,
      "unread_notifications": 4,
      "pending_approvals": 2,
      "open_tasks": 7,
      "upcoming_meetings": 3
    },
    "finance": {
      "outstanding": {
        "amount_minor": 150000000,
        "currency": "UZS"
      },
      "overdue_invoices": 8
    }
  }
}
~~~

Contract rules:

- Every section uses the same effective scope, time window, and generated_at
  snapshot.
- Rate fields ending in _fraction are always numbers from 0 through 1; fields
  ending in _pct are always numbers from 0 through 100. Do not reuse an
  ambiguous attendance_rate name with different units across endpoints.
- Omit finance when the caller lacks finance:read; never return a misleading
  zero or partially authorized total.
- Validate requested branch/department filters against the caller's effective
  scope.
- Apply top-N limits and pagination in SQL. Avoid loading all scoped students or
  teachers into Python before slicing.
- Cache for 30–60 seconds by tenant, effective scope, permission set, and filter
  window. Support an ETag or equivalent revalidation mechanism.
- A temporarily unavailable optional section may be omitted and identified by
  a structured warning. The remaining snapshot may still succeed.

This endpoint replaces the console's eight or nine independent dashboard reads
and gives leadership metrics one freshness boundary.

### 6. Freeze one finance unit contract without silent reinterpretation

The checked-in API contract says money is integer minor units plus currency,
while the verified presenters return decimal strings in major UZS fields such
as amount_uzs. Changing the interpretation in place would display values 100×
too large or too small.

The target contract is:

~~~json
{
  "amount_minor": 1500000,
  "currency": "UZS"
}
~~~

Rules and migration:

- amount_minor is a JSON integer (int64 in OpenAPI), never a float or decimal
  string. currency is an ISO currency code.
- During one announced compatibility window, add *_minor and currency alongside
  existing *_uzs fields. Do not change the meaning of an existing field.
- Migrate all consumers, publish deprecation metadata, and remove legacy major
  unit strings only in a versioned breaking release.
- Apply the same convention to invoices, payments, refunds, balances, fee
  structures, payout policies, and executive summaries.
- Store and calculate with Decimal or integer minor units internally; never
  round through binary floating point.
- Validate response presenters as well as write serializers: every present
  money value must be finite and parseable, required amounts cannot be null or
  empty, and a deliberately unavailable amount needs a stable reason code.
  Aggregates must include amount-coverage counts/warnings and remain
  unavailable when any required contributing amount is unavailable; missing
  values must never be summed as zero.

Primary evidence: agents/API-CONTRACT.md:251-257,
apps/finance/presenters.py, and apps/payments/presenters.py.

### 7. Standardize password change, errors, warnings, and logout semantics

Mandatory password change is an authorization state, not an advisory UI flag.
When role login or /users/me/ returns must_change_password=true, the issued
session may call only /users/me/, /auth/password/change/, and logout operations.
Every business-data operation must fail with HTTP 403 and the stable code
password_change_required until the password is changed.

POST /api/v1/auth/password/change/ accepts old_password and new_password with
these rules:

- new_password is an untrimmed string from 10 through 128 characters. Reject it
  before hashing when it falls outside that range; never truncate it.
- Run every configured Django AUTH_PASSWORD_VALIDATORS entry against the correct
  role-native account so length, similarity, common-password, and numeric-only
  checks share one policy.
- An incorrect current password returns the stable code wrong_password and a
  field error under errors.old_password.
- Any new-password length or validator failure returns the stable code
  weak_password and every actionable validator message under
  errors.new_password.
- A successful change clears must_change_password, revokes prior sessions, and
  returns a replacement opaque access credential for the current device.

The required failure shapes are:

~~~json
{
  "success": false,
  "code": "wrong_password",
  "message": "The current password is incorrect.",
  "errors": { "old_password": ["The current password is incorrect."] }
}
~~~

~~~json
{
  "success": false,
  "code": "weak_password",
  "message": "Choose a stronger password.",
  "errors": {
    "new_password": [
      "Use at least 10 characters.",
      "Choose a password that is not commonly used."
    ]
  }
}
~~~

Keep the release branch's flat error envelope across every JSON endpoint:

~~~json
{
  "success": false,
  "code": "validation_error",
  "message": "Please review the highlighted fields.",
  "errors": { "branch": ["Choose a branch you can access."] },
  "request_id": "01J..."
}
~~~

- code is stable and machine-readable; message is safe to show to an executive
  user; errors is optional field-level detail.
- Use the same envelope for authentication, authorization, validation,
  throttling, 402 subscription_required, and 503 temporarily_unavailable.
- Do not put implementation words such as “server,” “API,” or “database” in
  user-visible messages. Keep technical diagnostics in logs correlated by
  request_id.
- Successful degraded responses may carry structured warnings:

~~~json
{
  "success": true,
  "data": {},
  "warnings": [
    {
      "code": "information_delayed",
      "message": "Some information may be delayed.",
      "affected_sections": ["finance"]
    }
  ]
}
~~~

Make logout actions unambiguous:

- POST /api/v1/auth/logout/ revokes only the Bearer or browser-cookie session
  used for that request and needs no refresh-token body.
- POST /api/v1/auth/logout-all/ explicitly revokes every session for the current
  principal.
- Both operations are idempotent, return the normal success envelope, and clear
  the browser session cookie when present. Cookie-authenticated POSTs require a
  valid CSRF cookie/header pair; Bearer callers do not.
- The current local candidate implements these separate operations. Production
  copy may say “Sign out” only after that candidate behavior is deployed and
  verified against the release image.
- The same-origin edge must forward request cookies and upstream `Set-Cookie`
  responses on both `/api/` and authenticated `/ws/` routes. Its release smoke
  test must reject any rendered configuration that strips either direction.
- The production credential is a host-only `__Host-` cookie with `Secure`,
  `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain`. Rotate it after every
  successful role login and password change, expire it with the identical
  cookie scope on logout, and keep its idle and absolute lifetimes bounded and
  documented. The non-Secure local-development cookie is a separate DEBUG-only
  name and remains host-only, `HttpOnly`, `SameSite=Lax`, and `Path=/`.
- Keep Django's `csrftoken` cookie JavaScript-readable for the current browser
  contract, host-only, `Secure` in production, `SameSite=Lax`, and `Path=/`;
  it is a CSRF proof, not the authentication credential. If it becomes
  `HttpOnly` or is renamed, first add a same-origin operation that returns the
  current masked token after login-time rotation and coordinate the frontend
  change. Every authentication and identity response sends
  `Cache-Control: no-store`, returns JSON directly without redirects, and omits
  access, refresh, and session secrets from response bodies.
- Cookie-authenticated WebSocket handshakes must reject missing or foreign
  browser Origins. Every deliberate proxy origin must be listed exactly in the
  production trusted-origin configuration; wildcard sibling origins are not
  acceptable for ambient credentials.

### 7a. Normalize business input without treating the browser as a security boundary

The browser improves input quality, but it is never the injection defense. All
JSON, form, path, filter, ordering, and uploaded-file inputs must be validated
again before they reach a query or mutation.

- Trim outer whitespace from role-login usernames and reject empty values,
  control characters, or values longer than 150 characters. Treat submitted
  passwords as opaque strings: preserve surrounding whitespace exactly, reject
  control characters or values longer than 128 characters, and compare the
  unchanged value. Password creation and password change likewise remain
  untrimmed as specified above. Trimming is data normalization, not an injection
  defense; parameterized authentication and query handling are mandatory.
- Bound free-text search and filter values, treat metacharacters as literal
  user text, and allowlist every accepted filter and ordering key. Unknown keys
  must be ignored only when the published contract says so; otherwise return a
  safe validation error.
- Use Django ORM parameters or driver-bound parameters exclusively. Never
  interpolate user text into raw SQL, table names, column names, expressions,
  regular expressions, or sort clauses. Any unavoidable dynamic identifier
  must come from a closed backend allowlist.
- Use explicit serializer write fields. Do not pass arbitrary request objects
  into model creation or update operations, and never let a client assign
  tenant, ownership, permission, cashier, audit-actor, or historical-scope
  fields.
- Do not log query strings, request bodies, passwords, cookie/header values, or
  uploaded row contents. Student and teacher searches can contain names, phone
  numbers, and identifiers; retain only the normalized path, response status,
  duration, safe aggregate counts, and correlation identifier needed for
  operations.
- Enforce backend length, numeric, date-order, file-size, file-type, row-count,
  and relationship-scope limits even when the web form already provides them.
  Validation failures use the safe envelope above and keep technical details in
  request-correlated logs.
- Add negative tests for quotes, comment markers, wildcard-heavy strings,
  encoded control characters, traversal segments, malformed identifiers,
  unknown ordering fields, duplicate JSON fields where the parser exposes
  them, and overlong values. They must be rejected or handled as literal input,
  must never broaden tenant or branch scope, and must never produce a technical
  error response.

## Current local-candidate migration handoff (2026-08-02)

The current local backend candidate contains the migrations below. They have
been exercised against the local `public` and `demo` schemas only. **Do not
infer that production contains any of them until the user confirms that the
approved backend revision and its migrations reached production.**

- `audit.0005_audit_scope_snapshot` adds immutable audit scope evidence.
- `access.0003_registrar_safeguarding_permissions` reconciles the canonical
  registrar's safeguarding read/write grants for existing tenants while
  preserving explicit exact or resource-wide revokes. It does not grant
  safeguarding access to department heads or custom account types.
- `org.0019_centersettings_organization_timezone` adds the authoritative
  organization timezone.
- `finance.0009_invoice_historical_scope` and
  `payments.0005_payment_historical_scope` add immutable historical ownership
  and explicit unresolved/conflicting states.
- `academics.0004_assessment_integrity` adds assessment versions, correction
  state and lifecycle evidence, case-insensitive catalogue constraints, and
  database guards for published results.
- `assignments.0004_uploadgrant_source_cleanup` and
  `messaging.0005_uploadgrant_source_cleanup` add cleanup evidence for consumed
  upload sources.
- `payments.0006_fiscalreceipt_trusted_fields` adds the trusted receipt PDF key
  and provider payload fields.
- `reports.0006_report_scope_params_indexes` adds GIN indexes used by scoped
  report parameter lookups.
- A local `ai_app.0015_ai_request_scope_privacy` candidate exists, but it is
  **not** part of this verified production handoff yet. Do not run or expose it
  until the release preflight and maintenance manifest satisfy
  [BACKEND_AI_PRIVACY_CUTOVER_REQUIREMENTS_2026-08-02.md](./BACKEND_AI_PRIVACY_CUTOVER_REQUIREMENTS_2026-08-02.md)
  and the production owner confirms the exact promoted backend SHA.

### Pre-production migration and rehearsal gate (2026-08-02)

This gate applies to the current working backend only. It does not assert that
production contains these migrations, and no production migration should be
run until the user confirms the approved backend revision has been deployed.

`ai_app.0015_ai_request_scope_privacy` is intentionally irreversible. Its
privacy cutover encrypts or purges legacy generated content and declares no
reverse data operation. Django therefore raises `IrreversibleError` if another
schema downgrade would need to unapply it, including a rehearsal that moves the
parents/students graph behind migrations on which the current organization and
AI graph depends. Do not advertise or attempt an in-place rollback across this
boundary unless a separately reviewed reverse transformation is added and can
prove that it does not recreate expired or purged sensitive content.

Before production promotion:

1. Treat `ai_app.0015` as a backup/restore boundary. Take and restore-verify a
   pre-migration backup, record its revision and encryption-key requirements,
   and make restoration of that immutable backup the rollback procedure.
2. Rehearse the complete forward plan from a production-like copy using the
   exact candidate image. Do not test an unrelated historical migration by
   downgrading the shared integration schema through `ai_app.0015`.
3. Run historical migration tests in disposable schemas or databases. Restore
   the whole migration graph only when every intervening migration is declared
   reversible; otherwise discard and recreate the disposable database from its
   known snapshot.
4. Cleanup code must respect append-only and protected-history rules. Current
   `Branch.delete()` intentionally raises `ProtectedError`, so tests and
   rehearsal scripts must not delete branch, student, parent, transfer, or
   safeguarding history through current runtime models. Use disposable-database
   teardown, or an explicit, audited maintenance path designed for that exact
   purpose.
5. Add a release test that proves the documented backup restoration procedure,
   followed by a clean forward migration, schema-plan check, safeguarding
   ciphertext verification, and application smoke test. A passing forward-only
   migration is not evidence that rollback is safe.

Focused runtime checks completed before this gate was documented: 114
organization, parent, and availability checks passed without schema
transitions; the isolated PostgreSQL locking, parent-scope, guardian-lifecycle,
and ciphertext regressions passed 8 of 8; Ruff passed; and targeted mypy passed
for 253 source files. A fresh historical parent/student downgrade rehearsal was
correctly blocked by the irreversible AI boundary and is not counted as a
passing migration test.

Production handoff requirements:

1. Back up and restore-verify the target, record the approved image SHA, and
   inspect the public and every tenant migration plan from that same image.
2. Apply both public and tenant migrations with `migrate_schemas` before
   promoting the frontend. Recheck that every schema has an empty pending plan.
   In particular, an upgraded tenant that misses `access.0003` leaves its
   registrar unable to read or update protected medical information even
   though a newly provisioned tenant has the correct canonical grants.
3. Treat `academics.0004` as an application-contract transition, not only a
   column change. Its duplicate-catalogue preflight fails closed, its database
   guards become authoritative immediately, and the deployed code and local
   seed must use the confirmed, expected-version publication workflow.
4. After the historical-scope columns exist, run
   `backfill_audit_scopes` and `backfill_finance_attribution` in their default
   report-only modes. Archive and review resolved, unresolved, conflicting, and
   quarantined counts before a separately approved `--apply`; never guess an
   ambiguous branch or department.
5. `reports.0006` deliberately uses transaction-compatible `AddIndex` because
   tenant provisioning migrates a new schema inside its creation transaction.
   On production-sized report tables this can take a table lock. Measure the
   tables, define a maintenance/lock-timeout plan, and schedule any online index
   maintenance as a separate reviewed release operation.
6. Run readiness, cookie-session, OpenAPI, historical-attribution, assessment,
   upload-cleanup, receipt, report, and full regression gates after migration.
   Preserve the migration output and schema-by-schema plan as release evidence.

## Acceptance checks

All checks are required against the immutable candidate image and its published
OpenAPI document.

### Revision and deployment

- The image revision equals the approved full SHA and is visible in build
  provenance.
- The production target installs only locked runtime dependencies (for example,
  `uv sync --frozen --no-dev`) and excludes test modules and interactive/debug
  tooling. The verified Dockerfile currently copies a dependency environment
  containing pytest, factory-boy, IPython/ipdb, mypy, ruff, pre-commit, and
  pip-audit into the runtime; keep a separate development/test target instead
  of shipping that unnecessary size and attack surface.
- makemigrations --check, migration planning, deployment migration, and the
  backend test suite pass from the candidate image.
- Frontend schema validation reports no missing configured routes against that
  same image.

Schema-path validation is necessary but not sufficient: it cannot prove the
HTTP method, authorization, required selectors, envelope, field names, field
types, units, or empty/error behavior that a rendered view consumes.

### Executable leadership-view contract

Add a checked-in contract runner for the actual views exposed by
src/pages/backendPages.jsx and src/config/roles.js. It must run against the
candidate image with seeded director and department-head accounts. The runner
must cover the complete 104-view catalog as presented to each role; a
schema-path check alone does not satisfy this gate.

- Exercise every visible CEO and manager destination, tab, selected-record
  detail route, and declared related panel with valid IDs and mandatory query
  parameters.
- Assert the real status, content type, success/error envelope, pagination
  shape, warning shape, required field names, nullability, primitive types, and
  documented units used by the rendered fields.
- Prove that every manager-visible read succeeds inside the seeded manager's
  scope. Prove that the organization-wide directory, Finance, Access & roles,
  and every other excluded capability remain absent from manager navigation and
  fail closed when called directly.
- Include non-empty, empty, invalid-selector, out-of-scope, and unauthorized
  cases. A 200 response containing an unusable body is a contract failure.
- Resolve a seeded list row into each detail/related URL so placeholder-name,
  ID-bridge, and route-template mistakes are executable failures.
- Run this suite after migrations and before frontend promotion. Publish its
  backend revision, frontend revision, role fixture, and result as release
  evidence.

### Authorization and privacy

- With two branches, a department head scoped to branch A cannot list, search,
  or retrieve a branch-B user; direct retrieval returns 404.
- A director can retrieve both when tenant-wide access is intended.
- Revoking a membership or AccountType grant changes /users/me/ and endpoint
  authorization immediately, without requiring a new deployment.
- /users/me/ permissions equal the permissions actually enforced for that
  session, including tenant overrides and read-only state.
- A caller with teachers:read but without finance:read receives no teacher
  compensation fields.
- Student medical notes never appear in collections or unauthorized detail
  responses.

### Data contracts

- Student gender, branch, cohort, teacher, age, blocked, status, and date filters
  have positive, invalid-input, and cross-scope tests.
- The student teacher filter is tested with deliberately different
  TeacherProfile.id and bridge User.id values.
- Student and teacher rows always carry readable
  branch/department/cohort names where the corresponding ID is present.
- qualifications remains a string in the current schema and implementation.
- A value of 15,000.00 UZS serializes as integer 1500000 plus "UZS" in the new
  minor-unit fields; no money response contains JSON floats.
- /users/me/ returns a valid IANA organization_timezone and ISO 4217
  primary_currency. Tests use a browser zone different from the organization
  zone and prove that business dates retain the organization's calendar day.
- Every rate field obeys its suffix and range on boundary fixtures:
  *_fraction stays within 0..1 and *_pct stays within 0..100. The same 94.2%
  attendance fixture must serialize as 0.942 or 94.2 according to its explicit
  suffix, never through an ambiguous attendance_rate key.
- Every money object carries an explicit currency even when it matches
  primary_currency; clients never infer a currency from locale.
- Pagination and error envelopes match their documented schema on every changed
  endpoint.

### Executive summary and performance

- Decision-critical dashboard totals require one executive-summary request after
  identity/bootstrap filters. Row-level registers may load afterward for charts
  and drill-downs; bounded collection pages must never be presented as exact
  organization totals.
- All returned sections have one generated_at, one applied scope, and an
  explicit time window where relevant.
- Finance is omitted for a caller without finance:read and present for an
  authorized director using the same underlying dataset.
- Query count remains effectively constant when page size or tenant population
  grows; tests detect N+1 behavior.
- Pagination/top-N is applied before Python materialization for student-risk and
  teacher-intelligence data.
- On a documented production-sized fixture, the executive summary meets a
  release budget of p95 ≤ 500 ms when warm and p95 ≤ 1.5 s uncached. Record the
  fixture size, database class, sample count, and cache state with the result.
- Concurrent requests from different tenants or scopes never share cached
  results.

### Failure and session behavior

- Representative 400, 401, 402, 403, 404, 409, 422, 429, and 503 responses use
  the flat error envelope and include no internal exception text.
- A must-change-password login can read /users/me/ and change or end its
  session, but every business-data endpoint returns 403
  password_change_required until the change succeeds.
- Password tests cover 9, 10, 128, and 129 characters plus Django similarity,
  common-password, and numeric-only validators. Every policy failure uses
  weak_password with errors.new_password; a bad current password uses
  wrong_password with errors.old_password.
- A successful mandatory change clears the flag, invalidates the old access
  credential and other sessions, and returns one replacement credential that
  can immediately bootstrap /users/me/.
- Degraded success preserves structured warnings and names only affected
  product sections in executive-safe language.
- Normal logout invalidates the current credential but leaves a second device
  session valid; logout-all invalidates both. A browser tab opened after login
  bootstraps from the shared HttpOnly cookie without copying a credential into
  JavaScript-accessible storage.
- Repeating either logout operation is safe and does not produce a 500
  response.

Release approval requires evidence for every check above or an explicit,
time-bounded exception signed by the backend and product owners.
