# Backend AI privacy cutover requirements

Status: **release-blocking documentation; not production evidence**
Recorded: 2026-08-02
Backend candidate reviewed: local `starforge_edu` worktree only

## Production decision

Do not assume that `ai_app.0015_ai_request_scope_privacy` exists in production,
and do not enable production StarAI conversations merely because that migration
exists in a local backend checkout. The backend is still changing outside this
workspace. Re-review the exact immutable backend revision, its migration graph,
and its public contract after the production owner confirms the promoted SHA.

Until every gate in this document has evidence from that exact image:

- the frontend StarAI surface remains an explicitly labelled demonstration;
- it must not send unrestricted tenant records or hidden fields to a model;
- it must not imply that chats, citations, retention, or audit history are
  durably stored;
- the release must not run AI migration `0015` as an ordinary rolling deploy.

## Candidate behavior that must be reverified

The local candidate currently contains
`apps/ai/migrations/0015_ai_request_scope_privacy.py`, following
`ai_app.0014_seed_template_generation_prompt`. Its intended contract is:

- retain an immutable, role-native requester identity and the branch/department
  scope that authorized the request;
- quarantine legacy requests as unresolved rather than guessing authority from
  a person's current placement;
- encrypt non-expired generated output with the durable field-encryption key,
  authenticate a readback, and only then clear the legacy plaintext column;
- purge generated output and reversible redaction data after the historical
  30-day retention boundary while retaining aggregate accounting evidence;
- reject negative recorded cost and refuse migration while any request is
  `queued` or `running`;
- enforce empty legacy plaintext, non-negative cost, immutable attribution and
  scope, protected requester history, and append-only accounting evidence at
  the database boundary.

The current migration is intentionally irreversible: its data step has no
reverse operation. That is appropriate for purged content, but it makes the
backup, worker-drain, and review gates below mandatory.

## Provisional release-preflight integration

The first audit snapshot did not connect AI migration `0015` to the all-tenant
preflight or maintenance boundary. A later read-only check of the actively
changing, uncommitted backend worktree found provisional wiring for both:

- `("ai_app", "AIRequest")` is in the closed preflight model inventory;
- the preflight checks negative cost and `queued`/`running` requests and
  estimates total legacy rows and non-empty plaintext output;
- `ai_app.0015_ai_request_scope_privacy` is in the maintenance manifest;
- `ai_app.0014_seed_template_generation_prompt` is a legacy-tenant anchor.

This is moving-tree evidence, not a passed release gate or proof of production
state. The exact approved revision must preserve and complete the behavior
below, add focused tests for it, and execute it against every tenant:

1. Add the exact model target `("ai_app", "AIRequest")` to the command's closed
   model inventory. Resolve the table through Django's model metadata; never
   accept a model, table, column, predicate, or schema identifier from operator
   input.
2. Run the AI checks only when
   `ai_app.0015_ai_request_scope_privacy` is pending in the tenant schema and
   the legacy AI request table exists in that same schema.
3. Report these non-zero values as blocking issues:
   - requests with `cost_microusd < 0`;
   - requests whose status is `queued` or `running`.
4. Report only bounded aggregate workload estimates. The provisional command
   already reports the first two; the approved revision must also account for
   the retention workload:
   - total legacy AI requests;
   - rows with non-empty legacy `output_text`;
   - rows whose historical 30-day content deadline has passed;
   - rows with reversible redaction data that the migration will clear, if that
     count can be obtained without exposing content.
5. Keep the transaction read-only. Compare raw table names through bound SQL
   parameters for catalogue lookup and interpolate only backend-quoted
   identifiers selected from the closed inventory.
6. Emit only counts, migration names, and the existing one-way schema reference.
   Never emit tenant schema names, row identifiers, prompts, generated output,
   redaction maps, ciphertext, provider receipt IDs, encryption keys, or broker
   payloads.
7. With `--fail-on-blocked`, exit non-zero if any tenant has a blocker or cannot
   be inspected. A missing tenant-local migration table must remain a hard
   failure rather than falling through to `public.django_migrations`.
8. Add direct regression tests for the AI check's pending/applied behavior,
   blockers, aggregate-only output, SQL identifier boundary, and cutover
   manifest/legacy anchor. Inventory parameterization alone is not enough to
   prove that the AI check executes correctly.

Run the aggregate estimate once against a restored production-sized snapshot to
budget the window. Run the authoritative preflight again after web, ASGI, every
AI-capable worker, and beat are stopped and the AI queue is proven empty. No
writes may occur between that second preflight and migration.

## Non-rolling maintenance boundary

The approved candidate must retain
`("ai_app", "0015_ai_request_scope_privacy")` in the complete tenant
maintenance manifest and retain
`("ai_app", "0014_seed_template_generation_prompt")` in the legacy-tenant
anchors. A new schema may bootstrap directly; any established or partially
upgraded tenant must stay behind the maintenance boundary until the entire
required migration set is applied.

This cannot be a mixed-version rollout. An old web or worker process can still
write legacy plaintext output and lacks the new immutable principal/scope
shape. Stop every old process before schema change, drain or explicitly resolve
all AI work, migrate every tenant from one immutable image, and restart only
that image.

Required cutover evidence, without sensitive values:

1. Exact approved 40-character image SHA and matching migration plan for
   `public` and every tenant schema.
2. Restore-tested, quiesced database and broker backup plus configuration/object
   backup where the release process requires them.
3. One-way fingerprint evidence that the same durable
   `FIELD_ENCRYPTION_KEY` is present in migration, web, ASGI, and worker
   workloads. Never print or rotate the key during this cutover.
4. AI queue depth of zero and aggregate preflight counts showing no queued,
   running, or negative-cost requests.
5. Successful shared and tenant migration plans with `ai_app.0015` recorded in
   every applicable tenant and no pending maintenance migration.
6. Post-migration database checks proving the legacy `output_text` column is
   empty, non-expired output is stored as authenticated ciphertext, expired
   output/redaction data is purged, and no constraint or trigger was bypassed.
7. Runtime tests proving requester/scope capture, permission revalidation before
   provider calls and output application, cross-branch denial, retention purge,
   and authorized decryption through the application field—not through logs or
   ad-hoc exports.

## Required automated tests

The immutable candidate should fail CI unless it covers all of the following:

- the maintenance manifest names the real `ai_app.0015` migration and its
  `0014` legacy anchor;
- preflight detects negative cost and in-flight requests in every tenant, emits
  aggregate counts only, and rejects unapproved model/field identifiers before
  querying the registry;
- migration from the real `0014` state encrypts and authenticates active legacy
  output before clearing plaintext;
- expired output and redaction data are purged, with no recovery implied;
- negative-cost and queued/running fixtures abort atomically;
- legacy rows become authority-free unresolved records rather than receiving a
  guessed principal, branch, or department;
- resolved inserts require a live role-native principal, permission, and valid
  branch/department relationship;
- attribution, scope, provider receipt after capture, and accounting evidence
  cannot be silently rewritten or deleted;
- old and new application images are never allowed to share a migrated schema;
- logs and release artifacts contain no prompt, output, redaction, ciphertext,
  provider identifier, role-native principal ID, or tenant schema name.

## Failure and rollback

- A failure before migration starts may restart the recorded previous image
  only after confirming that no schema changed.
- Once any tenant commits `ai_app.0015`, do not start the previous image. Keep
  application workloads offline while repairing forward or restoring the
  complete verified pre-migration snapshot.
- Django cannot reverse the candidate's data operation. Reconstructing the old
  plaintext column from ciphertext is not an approved rollback procedure.
- Purged expired output and redaction data cannot be recovered from the migrated
  database. Only the access-restricted, verified pre-migration snapshot can
  recover them, and only under an explicitly approved privacy/incident need.
- A decryption mismatch or failed authenticated readback is an integrity
  incident. Preserve safe aggregate evidence, but never copy raw plaintext or
  ciphertext into tickets, chat, command output, or release logs.

## Frontend activation gate

Production StarAI may be enabled only after the production owner confirms the
exact migrated backend revision and the frontend verifies the published
contract against it. That contract must include server-side conversations,
message streaming, citations restricted to records visible at retrieval time,
scope/filter metadata per answer, retention and deletion controls, prompt-
injection defenses, rate and budget limits, audit events, and stable
permission-safe error responses. A migrated storage table by itself does not
satisfy this product gate.
