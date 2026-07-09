# Behavior Rules Spec: Identity & Authorization

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. Bound to feature.spec.md v0.5.6 (SPEC-006). -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-006 |
| feature_name | FEAT-006-identity-and-authorization |
| version | 0.5.6 |
| content_hash | not-tracked — feature.spec.md is the speckit hash anchor for this package |
| last_edited | 2026-07-08T19:41:56Z |

**Purpose:** Captures deterministic, rule-based behavior not fully expressed by acceptance criteria
alone — the `authorize()` matcher precedence, the load-bearing ordering of the gateway pipeline,
default column values, security limits, and the username deduplication rule. All rules use EARS.

---

## EARS Syntax Guide

All rules below use EARS (Easy Approach to Requirements Syntax). "shall" is mandatory; "should"/"may"
are forbidden. Each statement maps to exactly one test case.

| Pattern | Structure |
|---|---|
| Ubiquitous | `The <system> shall <response>` |
| Event-driven | `WHEN <trigger>, the <system> shall <response>` |
| State-driven | `WHILE <state>, the <system> shall <response>` |
| Unwanted | `IF <condition>, THEN the <system> shall <response>` |
| Complex | `WHILE <state>, WHEN <trigger>, the <system> shall <response>` |

---

## 1. Precedence Rules

### 1.1 Permission Match Resolution (the `authorize()` matcher)

**Situation:** When `authorize(principalId, permission, {workspaceId, entityType?, entityId?})` must
decide `allowed`, several effective rows may bear on the same requested `permission`.

**Sources in precedence order (highest to lowest):**
1. **Disabled-principal short-circuit** — WHILE the principal's `status` is `disabled`, the authorizer shall return `allowed=false` with reason `principal_disabled`, ignoring all grant rows.
2. **Owner wildcard row (`*`)** — WHERE the principal's effective set contains the built-in owner `*` row (unconstrained, same workspace), the authorizer shall return `allowed=true` for any requested permission.
3. **An exact matching grant row** — WHEN at least one effective row satisfies all of: `permission` equals the requested permission; `workspace_id` equals `workspaceId`; (`resource_type IS NULL` OR `resource_type == entityType`); and `constraint_json IS NULL` — the authorizer shall return `allowed=true`.
4. **Fail-closed default** — IF no higher rule fires, THEN the authorizer shall return `allowed=false` with reason `no_grant`.

**Semantics between grant rows:** OR, not precedence — WHEN two or more grant rows match, the
authorizer shall return `allowed=true`; no tie-break is required (see § 6.1). There is no
explicit-deny row in v1; "deny" is the absence of any match.

**Example:**
- Scenario: an editor with `content.write` (unscoped) requests `content.write` on a post.
- Result: rule 3 fires; `allowed=true`.
- Scenario: the same editor requests `changeset.revert` (not granted).
- Result: rule 4 fires; `allowed=false`, reason `no_grant` (AC-04).

**Test requirement:** The TDD Agent must test each rule in isolation and the disabled short-circuit
overriding an otherwise-matching grant.

### 1.2 Effective-Set Composition

**Situation:** When resolving a principal's effective rows before matching.

**Sources (unioned, not ranked):**
1. Permissions from the principal's **roles' policies** (`principal_roles → role_policies → policy_permissions`) — the human path.
2. Permissions from **policies attached directly** to the principal (`principal_policies → policy_permissions`) — the machine path.

The authorizer shall union both sources, scoped to `workspaceId`, before applying § 1.1. WHERE a
principal has only direct policies and no role (a typical API-key principal), the authorizer shall
still resolve its permissions (AC-13).

### 1.3 Grant-Authority Clamp (INV-07)

**Situation:** WHEN performing any grant-writing transition — issuing an API key (`ISSUE_API_KEY`),
assigning a role (`ASSIGN_ROLE`), attaching a policy to a principal (`ATTACH_POLICY`), or widening a
policy (`WRITE_POLICY_PERMISSION`).

**Rule:** IF any permission conferred by the grant (a policy being attached, the assigned role's
policies, or the added policy-permission) is not held by the **granter** as an **unconstrained**
effective row (`resource_type IS NULL` AND `constraint_json IS NULL`, same workspace — owner's `*`
qualifies), THEN the system shall reject the grant with `GRANT_EXCEEDS_ISSUER` and write no row. A
permission the granter holds only conditionally (resource-scoped or constraint-bound) shall not be
delegated and shall not be widened into an unconstrained grant. Consequence: only an owner (`*`) may
assign the built-in `owner` role or attach the built-in `owner` policy, so no `role.manage` holder can
escalate a principal above its own authority (AC-15, AC-24, EC-10, EC-11).

**Machine-authority isolation (v0.5.4, F-053-01):** `ASSIGN_ROLE`/`ATTACH_POLICY` target **human**
(`kind='user'`) principals only, and `ISSUE_API_KEY` binds only a **grantless** api_key principal (no
pre-existing `principal_roles`/`principal_policies` rows) — its `principal_policies` are then written
solely at that one clamped issuance. So an `api_key` principal's authority equals exactly its single
issuance and can never be grown afterward; an `apikey.manage` admin can never obtain a key that
authenticates above what it could itself clamp-grant. A grant transition targeting an `api_key`/`system`
principal, or an issuance against a non-grantless principal, is rejected 400 `VALIDATION_ERROR` (AC-25).

**Issuance-snapshot immutability (v0.5.5, F-054-01):** `ISSUE_API_KEY` does not attach a live reference to
a caller-supplied shared policy — it **copies** the clamped permissions into a fresh `is_frozen=true`,
machine-owned policy and attaches that. `WRITE_POLICY_PERMISSION` refuses any `is_frozen` (or `is_builtin`)
policy, so a later **legal** widening of a *source* policy (by an owner / `role.manage` holder whose own
clamp passes) can never grow an already-issued key. The key's effective permission set is therefore fixed at
issuance against *permission* drift, not only *row* drift (AC-26).

---

## 2. Ordering Rules

### 2.1 Gateway Pipeline Order (load-bearing)

**Context:** Every SPEC-001 mutation flows through a fixed ordered pipeline.

**Order:** `authenticate → authorize → idempotency-cache lookup → feature execution / inverse
capture → change-set write`.

**Invariant:** The system shall run `authorize()` **before** the idempotency-cache lookup. IF
`authorize()` returns `allowed=false`, THEN the gateway shall abort with 403 `FORBIDDEN` and shall
return neither a `DUPLICATE_COMMAND` result nor the original `changeSetId`, even for a replayed
command id (INV-04, EC-08). Reordering authorization after the idempotency check is a correctness
bug (it leaks a replay oracle to a demoted or revoked-key caller).

### 2.2 Actor Stamping Order

**Context:** WHEN a mutation is authorized and executes.

**Order:** The gateway shall stamp `change_sets.actorId` with the caller's principal id at
change-set write time, replacing the legacy `user-local` stub. WHILE the actor is the seed-time
`system` principal (first-boot seed writes), the gateway shall stamp `system`, not `user-local`
(EC-01). WHILE the caller is a `tovu` CLI / in-process core caller (no HTTP session or API key), the
gateway shall resolve the seeded `owner` principal and stamp its id (REQ-13, EC-12), never leaving a
CLI mutation unattributed or unauthorized.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `status` | new `principals` row | `'active'` | New principals are usable immediately; disabling is an explicit, audited transition (REQ-11). |
| `resource_type` | `policy_permissions` row | `null` | Null means unscoped (applies globally within the workspace); scoping is opt-in so an omitted scope is never silently narrowed. |
| `constraint_json` | `policy_permissions` row | `null` | Null means no field/row rule; the ABAC engine is deferred (OQ-03), and a non-null value the v1 evaluator cannot interpret fails closed (INV-03). |
| `is_builtin` | new `roles` / `policies` row | `false` | Only the seed creates built-ins; user-created roles/policies are always mutable/deletable. |
| `is_frozen` | new `policies` row | `false` | Only `ISSUE_API_KEY` mints a frozen snapshot policy (`is_frozen=true`); `CREATE_POLICY` and built-ins are `false`. A frozen policy is immutable — `WRITE_POLICY_PERMISSION` (and any future `DELETE_POLICY`) refuses it (AC-26, F-054-01). |
| `expires_at` | `api_keys` row | `null` | Null means no expiry; operators opt into expiry. Validity still requires non-revoked + active principal (REQ-08). |
| `revoked_at` | `sessions` / `api_keys` row | `null` | Null means live; set on logout/disable/revoke. |
| `email` | `users` row | `null` | Email flows (reset/verify) are deferred (OQ-04); email is optional metadata in v1. |
| session cookie flags | `sessions` cookie | `HttpOnly; SameSite=Strict; Secure` | Session-theft and CSRF hardening on the isolated admin origin (ADR-020, REQ-06). |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Password hashing | argon2id | API (core) | INV-05; behind a `HasherPort` (rule-of-two candidate). Raw password never stored. |
| API-key hashing | argon2id (or equivalent KDF) | API (core) | INV-05; only `key_hash` + non-secret `prefix` persisted. |
| Session lifetime | **absolute** expiry: `expires_at` = `created_at` + **30 days**, fixed at creation (v1) | API | Sliding/rolling renewal is deferred (OQ-04). A session past `expires_at` → 401 on the next request, treated as revoked, never reaching `authorize()` (REQ-06, EC-13, AC-20). |
| `username` length | 1–255 characters (post-trim) | API | Blank-only rejected with `VALIDATION_ERROR`. |
| `label` length (api key) | 1–255 characters | API | |
| `policyIds` per key issuance | ≥ 1 | API | A key with zero policies can authenticate but authorizes nothing; issuance requires at least one (REQ-08). |
| Login rate limit | 10 requests / 60s per IP, burst 0 | API | Brute-force guard (`LOGIN_STRICT`, api.spec § 3); exceed → 429 `RATE_LIMIT_EXCEEDED`. |
| Write rate limit | 30 requests / 60s per principal, burst 5 | API | `WRITE_STANDARD` (api.spec § 3). |
| Read rate limit | 300 requests / 60s per principal, burst 50 | API | `READ_STANDARD` (api.spec § 3). |
| Owner wildcard `*` scope | built-in `owner` policy only | API (catalog validator) | A non-built-in policy naming `*` is rejected (REQ-04). |

Rate-limit window/max/burst values mirror api.spec § 3 exactly (DoD F-06) and trace to **REQ-14**;
`LOGIN_STRICT`'s client-IP resolution (trusted-proxy rule) is specified in api.spec § 3.

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate

A `users` row is a duplicate if:
1. It shares the same `workspace_id` as an existing user, AND
2. Its `username` equals an existing user's `username` after case-insensitive comparison and Unicode NFC normalization.

`username` uniqueness is **per workspace**, not global — the same username may exist in two
different workspaces (they are distinct principals; INV-01 keeps them isolated).

**Not a duplicate:** the same username in a different workspace.

### 5.2 How Duplicates Are Handled

WHEN a **user-creation** request would create a duplicate `username` within a workspace, the system
shall reject it with `RESOURCE_CONFLICT` (409, `details.field = "username"`) and create no row. This
rule applies to user creation only; **API-key issuance does not create a `username`** and is never
subject to this constraint (it is gated instead by the INV-07 issuance clamp, § 1.3).

### 5.3 Idempotency vs. Deduplication

These are distinct. Command idempotency (SPEC-001 `Idempotency-Key`) is content-independent and is
short-circuited **after** authorization (§ 2.1). Username deduplication is content-based and is a
uniqueness constraint, not an idempotent replay.

---

## 6. Tie-Break Logic

### 6.1 Multiple Matching Permission Rows

**When it applies:** When two or more effective rows match the requested permission (e.g. one from a
role, one from a direct policy).

**Tie-break rule:** None required. The authorizer shall return `allowed=true` if **any** row matches
(OR semantics, § 1.1). The decision is boolean; no single row must be selected as "the winner."

**Rationale:** Authorization is a set-membership question, not a ranking; OR semantics are the
simplest fail-closed rule and are order-independent.

**Invariant:** The result is deterministic — identical DB snapshot and inputs always produce the
same `{allowed, reason}`.

### 6.2 Concurrent Sessions for One Principal

**When it applies:** WHEN one principal has multiple live sessions (EC-05).

**Tie-break rule:** Sessions are independent; the system shall not treat one as canonical. Revoking
one session shall not revoke the others; disabling the principal shall invalidate all.

**Rationale:** Multi-device login is expected; per-session revocation is finer-grained than
per-principal disable.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| Principal disabled mid-session | IF the principal is `disabled`, THEN the next request with its session shall return 401 (session treated as revoked) — EC-02. | Yes |
| Session past `expires_at` (valid, non-revoked) | IF a session is past its absolute `expires_at`, THEN the next request shall return 401 `UNAUTHENTICATED`, treated as revoked, never reaching `authorize()` — EC-13, AC-20. | Yes |
| `tovu` CLI / core mutation with no session or key | WHEN a CLI/core mutation runs, THEN the gateway shall resolve the seeded `owner` principal, run `authorize()`, and stamp its id — never unauthenticated, never bypassing the gate — EC-12, AC-17. | Yes |
| Disable that would remove the last active owner-`*` | IF a disable would leave zero `active` owner-`*` principals (incl. self-disable), THEN it shall be refused with `OWNER_REQUIRED` — INV-08, AC-21. | Yes |
| Disable targeting the **seeded owner** principal | THEN it shall be refused with `OWNER_REQUIRED` unconditionally, even if other active owners exist — REQ-11/REQ-13, AC-21 (MF-2). | Yes |
| Two concurrent disables of the last two owners | THEN the atomic count-check+update shall allow at most one to commit; the second is refused `OWNER_REQUIRED` — INV-08 (MF-3). | Yes |
| Principal disable by a caller lacking `user.manage` | IF the caller does not hold `user.manage`, THEN a disable shall return 403 `FORBIDDEN` — REQ-11, AC-21. | Yes |
| `CREATE_USER` naming an existing principalId (bind attempt) | THEN it is not representable — user creation mints a fresh `kind='user'` principal; no credential attaches to a pre-existing principal — REQ-01, AC-22 (MF-1). | Yes |
| `ISSUE_API_KEY` naming a `user`/`system`/seeded-`owner` principal as the bound principal | THEN it is rejected 400 `VALIDATION_ERROR`; a key binds only to a fresh `kind='api_key'` principal, so it can never authenticate as a privileged principal — REQ-08, AC-23 (F1). | Yes |
| `ISSUE_API_KEY` naming a **non-grantless** api_key principal (one already holding a role/policy row, e.g. owner-endowed) | THEN it is rejected 400 `VALIDATION_ERROR`; a key binds only to a grantless principal, so its authority equals exactly the clamped attached policies, never the bound principal's accumulated authority — REQ-08, AC-25a (F-053-01). | Yes |
| `ASSIGN_ROLE`/`ATTACH_POLICY` targeting an `api_key`/`system` principal | THEN it is rejected 400 `VALIDATION_ERROR`; human-grant transitions target `kind='user'` only, machine authority is set solely at issuance — REQ-02, AC-25b (F-053-01). | Yes |
| A source policy `P` is legally widened by `WRITE_POLICY_PERMISSION` **after** a key snapshotting `P` was issued | THEN the already-issued key does NOT gain the new permission — it holds an `is_frozen` copy taken at issuance, not a live reference to `P`; `authorize(keyPrincipal, newPerm)` stays denied — REQ-08, AC-26 (F-054-01). | Yes |
| `WRITE_POLICY_PERMISSION` targeting an `is_frozen` issuance-snapshot policy | THEN it is refused (an issuance snapshot is immutable, like a built-in) — REQ-08, AC-26 (F-054-01). | Yes |
| API key whose principal is disabled | IF the bound principal is not `active`, THEN the request shall return 401 even though the key is non-revoked — EC-03. | Yes |
| Permission in catalog but in no held policy | IF no effective row matches, THEN `authorize()` shall return `allowed=false` reason `no_grant`; the route shall return 403 — EC-04. | Yes |
| `resource_type='post'` grant evaluated with `entityType='page'` | IF `resource_type != entityType`, THEN the authorizer shall return `allowed=false` reason `resource_scope_mismatch` — EC-06, AC-14. | Yes |
| `resource_type='post'` grant evaluated with no `entityType` | IF `entityType` is absent while `resource_type` is non-null, THEN the authorizer shall deny (fail-closed) — EC-06, AC-14. | Yes |
| Non-null uninterpretable `constraint_json` | THEN the authorizer shall deny reason `unconstrained_deny`; the grant is NOT treated as unconstrained — EC-06, AC-09. | Yes |
| Owner `*` after a feature registers a new permission `x.write` | WHEN `authorize(owner, "x.write")` is evaluated, THEN it shall return `allowed=true`; the same check for `editor` shall deny unless explicitly granted — AC-16. | Yes |
| Admin attaches built-in `owner` policy to a key | THEN issuance shall be rejected `GRANT_EXCEEDS_ISSUER` — EC-10, AC-15. | Yes |
| Admin holds `content.write` only for `resource_type='post'`, attaches unconstrained `content.write` | THEN issuance shall be rejected `GRANT_EXCEEDS_ISSUER` (conditional hold cannot be widened) — EC-11, AC-15. | Yes |
| Owner (effective `*`) issues a key attaching any valid policy | THEN issuance shall succeed (the `*` hold satisfies the clamp) — AC-15. | Yes |
| Demoted/revoked caller replays a previously-successful command id | THEN `authorize()` runs before idempotency and returns 403; no `DUPLICATE_COMMAND`/`changeSetId` disclosed — EC-08, INV-04. | Yes |
| Legacy `change_sets` with `actorId='user-local'` after migration | THEN a disabled `user-local` principal exists so the composite FK resolves; history is not rewritten — EC-09, AC-01. | Yes |
| `role.manage` holder tries to add a permission to `viewer`'s built-in policy | THEN the write shall be refused (INV-06) — AC-01. | Yes |
| First-boot seed write before any human login | THEN the change-set `actorId` shall be `system`, not `user-local` — EC-01. | Yes |
| `username` blank after trim | Rejected with `VALIDATION_ERROR` at the API layer — § 4. | Yes |
| Login attempts exceed 10/60s from one IP | Rejected with 429 `RATE_LIMIT_EXCEEDED` — § 4. | Yes |
