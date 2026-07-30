# State Contract Spec: Identity & Authorization

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/state.spec.md -->
<!-- Part of the spec-system package. Bound to feature.spec.md v0.7.0 (SPEC-006). -->

- Spec ID: `SPEC-006`
- Feature: `FEAT-006-identity-and-authorization`
- Version: `0.7.0`
- Content Hash: `not-tracked — feature.spec.md is the speckit hash anchor for this package`
- Last Edited: `2026-07-28T00:00:00Z`

## Purpose
Defines the **persistent server state** for identity & authorization — the `content.db` tables,
their legal transitions, the derived `authorize()` projection, and the relational invariants — in a
language-neutral format. This feature has no client-side store; "state" here means durable rows in
SQLite (and the memory adapter, per ADR-015 rule-of-two), not a UI reducer. All rows are
workspace-scoped (ADR-007) and joined by composite `(workspace_id, id)` keys (REQ-10).

## 1) State Shape (Persistent Tables)
| Table | Purpose | Workspace Column | Notes |
|---|---|---|---|
| `principals` | Root identity for every actor | `workspace_id` | `kind ∈ {user, agent, api_key, system}`; `status ∈ {active, disabled}`; disable-only (REQ-01/REQ-11) |
| `users` | Human auth credentials | `workspace_id` | `password_hash` argon2id; `username` unique per workspace (REQ-01) |
| `sessions` | Revocable server-side sessions | `workspace_id` | `token_hash`, `expires_at`, `revoked_at` (REQ-06) |
| `api_keys` | Principal-bound headless credentials | `workspace_id` | `key_hash`, `prefix`, `expires_at`, `revoked_at` (REQ-08) |
| `roles` | Named RBAC roles | `workspace_id` | `is_builtin` for owner/admin/editor/viewer (REQ-02) |
| `policies` | Permission bundles | `workspace_id` | `is_builtin`; `is_frozen` (immutable issuance snapshot, REQ-08/F-054-01); exist independently of roles (REQ-02) |
| `policy_permissions` | Permissions carried by a policy | `workspace_id` | `permission`, nullable `resource_type`, nullable `constraint_json` (REQ-02/REQ-03); rows on a `is_frozen` policy are a copy snapshotted at API-key issuance and never change |
| `role_policies` | Role → policy join | `workspace_id` | Composite FK to both parents (REQ-02/REQ-10); **not user-writable in v1** — rows exist only from SEED (built-in role→policy 1:1); custom role→policy binding is deferred, custom grants flow via `principal_policies`/`ATTACH_POLICY` (F-053-02) |
| `principal_roles` | Principal → role join (human path) | `workspace_id` | Composite FK (REQ-02/REQ-10) |
| `principal_policies` | Principal → policy direct grant (machine path) | `workspace_id` | v1; how an api_key principal holds permissions (REQ-02/REQ-08) |
| `change_sets` | Existing SPEC-001 audit table, now carrying identity | `workspace_id` | `actorId` references `principals` by `(workspace_id, actorId)` (REQ-01/REQ-10) |

Initial state at first boot (REQ-09 seed): one `system` principal; one disabled legacy `user-local`
principal (`kind='system'`, `status='disabled'`) in the local workspace; four built-in roles
(`owner`, `admin`, `editor`, `viewer`) each 1:1 with a built-in policy; one `owner` user.

## 2) Entity Contracts
```yaml
Principal:
  id: string (uuid)
  workspaceId: string
  kind: enum[user, agent, api_key, system]
  displayName: string
  status: enum[active, disabled]
  disabledAt: string (date-time) | null
  createdAt: string (date-time)

User:
  principalId: string (uuid)
  workspaceId: string
  username: string          # unique per workspace
  email: string | null
  passwordHash: string      # argon2id; raw password never stored (INV-05)
  lastLoginAt: string (date-time) | null

Session:
  id: string (uuid)
  workspaceId: string
  principalId: string (uuid)
  tokenHash: string         # raw token never stored (INV-05)
  createdAt: string (date-time)
  expiresAt: string (date-time)
  revokedAt: string (date-time) | null
  ip: string | null
  userAgent: string | null

ApiKey:
  id: string (uuid)
  workspaceId: string
  principalId: string (uuid)
  label: string
  keyHash: string           # raw key never stored (INV-05)
  prefix: string            # non-secret lookup prefix
  lastUsedAt: string (date-time) | null
  expiresAt: string (date-time) | null
  revokedAt: string (date-time) | null

PolicyPermission:
  workspaceId: string
  policyId: string (uuid)
  permission: string        # dotted, catalog-validated (REQ-03); "*" only on built-in owner policy
  resourceType: string | null    # null = unscoped; non-null = applies only when entityType matches
  constraintJson: string | null  # v1 seam; non-null and uninterpretable => fail-closed deny (INV-03)
```

## 3) Action Catalog (State Transitions)
| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `SEED_FIRST_BOOT` | none | fresh `tovu init`, not already seeded | insert system + disabled `user-local` principals, 4 built-in roles+policies, owner user | idempotent; re-seed is a no-op |
| `CREATE_PRINCIPAL` | `kind` (**`api_key` only in v1**), `displayName` | caller holds `apikey.manage`; `kind='api_key'` only — `kind='agent'` is rejected `VALIDATION_ERROR` (deferred, OQ-01); human principals are created only via `CREATE_USER`, and `system`/`user-local` only via `SEED_FIRST_BOOT` | insert `principals` row `status='active'` in caller's workspace, **grantless** (no `principal_roles`/`principal_policies` rows) | mints the `kind='api_key'` principal `ISSUE_API_KEY` binds to (RT-003), grantless as ISSUE_API_KEY's precondition requires (F-053-01); **no human/system creation path here** (MF-1) |
| `CREATE_USER` | `username`, `email?`, `password` (**no caller-supplied principalId**) | caller holds `user.manage` **or** `member.manage`; `username` unique per workspace (behavior §5.1) | **atomically** insert a NEW `kind='user'` principal (`status='active'`) AND its `users` row (`password_hash` argon2id) in one transaction — **never** binds to a pre-existing principal | duplicate `username` → 409 `RESOURCE_CONFLICT` (AC-19); blank username → `VALIDATION_ERROR`; attaching a credential to an existing principalId is not representable (MF-1, AC-22) |
| `CREATE_ROLE` / `CREATE_POLICY` | `name`, `description?` | caller holds `role.manage`; new rows are `is_builtin=false` **and `is_frozen=false`** (only `ISSUE_API_KEY` mints `is_frozen` policies) | insert `roles` / `policies` row | built-ins are created only by SEED and are immutable (INV-06) |
| `ASSIGN_ROLE` | `principalId`, `roleId` | caller holds `role.manage`; both rows in caller's workspace; **target is a `kind='user'` (human) principal** — `api_key`/`system` target → `VALIDATION_ERROR` (AC-25, F-053-01); role may be **built-in or custom**; **INV-07 grant clamp passes** — every permission carried by the role's policies is held **unconstrained** by the caller (assigning the built-in `owner` role therefore requires holding `*`, i.e. owner-only) | insert `principal_roles` row (composite `(workspace_id,id)` FK) | the **human grant path** — e.g. assign `editor`, or (as owner) assign the built-in `owner` role to mint a second owner-`*` principal; enables the AC-03/AC-11/AC-21 states (F2); non-`user` target → 400 `VALIDATION_ERROR`, no assignment (AC-25); clamp fail → 403 `GRANT_EXCEEDS_ISSUER`, no assignment (AC-24) |
| `ATTACH_POLICY` | `principalId`, `policyId` | caller holds `role.manage`; policy (built-in or custom) in caller's workspace; **target is a `kind='user'` (human) principal** — `api_key`/`system` target → `VALIDATION_ERROR` (AC-25, F-053-01); **INV-07 grant clamp passes** — every permission the policy carries is held **unconstrained** by the caller (attaching the built-in `owner` policy therefore requires holding `*`, owner-only) | insert `principal_policies` row | direct principal→policy grant, human path only; the api_key machine path's `principal_policies` rows are written **solely** by `ISSUE_API_KEY` at issuance; non-`user` target → 400 `VALIDATION_ERROR`, no attach (AC-25); clamp fail → 403 `GRANT_EXCEEDS_ISSUER`, no attach (AC-24) (F2) |
| `LOGIN` | `username`, `password` | principal is `active`; password matches argon2id | insert `sessions` row; set `lastLoginAt` | wrong creds / disabled → 401 `UNAUTHENTICATED`, no session (AC-02, EC-02) |
| `LOGOUT` | current session | valid session | set `sessions.revokedAt` | already revoked → idempotent 204 |
| `DISABLE_PRINCIPAL` | `principalId` | principal exists; caller holds **`user.manage`** (owner-only, REQ-11); target is **not the seeded owner** (REQ-13); the disable must not remove the last `active` owner-`*` principal (INV-08), incl. self-disable; the owner-count check and the status update run in **one atomic (serializable) transaction** so concurrent disables cannot both pass | set `status='disabled'`, `disabledAt` | never hard-deletes (INV-02); would-lock-out or seeded-owner target → refused **`OWNER_REQUIRED`** (INV-08, AC-21); missing `user.manage` → 403 (AC-21); all that principal's sessions/keys stop validating immediately (AC-05, EC-02) |
| `ISSUE_API_KEY` | `principalId`, `label`, `policyIds`, `expiresAt?` | caller holds `apikey.manage`; the bound `principalId` references a **`kind='api_key'`** principal in the caller's workspace (minted via `CREATE_PRINCIPAL`) — **never** a `user`/`system`/seeded-`owner` principal (F1) — that is also **grantless** (no pre-existing `principal_roles`/`principal_policies` rows), so the key's authority equals exactly the attached policies, never the bound principal's accumulated authority (F-053-01); the source `policyIds` are **in the caller's workspace** and **carry no `*`** (the built-in `owner` policy may not be a snapshot source — an api_key snapshot never carries `*`, REQ-04/AC-26); INV-07 clamp passes for every delegated permission | insert `api_keys` row bound to that api_key principal; **snapshot** the permissions carried by the requested `policyIds` — copied **field-identically** (`permission`, `resource_type`, `constraint_json` preserved per row, never scope-widened), each already INV-07-clamped to the issuer — into a **new `is_frozen=true`, machine-owned policy** created at issuance, and attach **that frozen policy** to the bound principal via `principal_policies` — the key holds a **frozen copy**, never a live reference to a shared, editable policy, so a later `WRITE_POLICY_PERMISSION` on the source policies cannot grow the key (F-054-01) | non-`api_key` bound principal → 400 `VALIDATION_ERROR`, no key (AC-23); **non-grantless** bound principal → 400 `VALIDATION_ERROR`, no key (AC-25); **`*`-bearing source policy** → 400 `VALIDATION_ERROR`, no key (AC-26); clamp fail → 403 `GRANT_EXCEEDS_ISSUER`, no key (AC-15, EC-10/EC-11) |
| `REVOKE_API_KEY` | `keyId` | key exists in caller's workspace; caller holds `apikey.manage` | set `api_keys.revokedAt`; **retire the key's issuance-owned `is_frozen` policy** (its `principal_policies` row + the frozen `policies` row + its `policy_permissions`), so revoked keys leave no orphan snapshot rows | immediate; next request with that key → 401 (AC-06); the frozen snapshot policy is machine-owned and 1:1 with the key, so retiring it affects no other principal |
| `WRITE_POLICY_PERMISSION` | `policyId`, `permission`, `resourceType?`, `constraintJson?` | **caller holds `role.manage`** (V-1); permission is in the registered catalog; parent policy is **not** `is_builtin` **and not `is_frozen`** (an issuance snapshot is immutable, F-054-01); **INV-07 grant clamp passes** — the added permission is held **unconstrained** by the caller (a policy cannot be widened beyond the caller's own authority) | insert `policy_permissions` row | unknown permission → 400 `PERMISSION_UNKNOWN` (AC-10); built-in **or frozen** parent → refused (INV-06/AC-26); clamp fail → 403 `GRANT_EXCEEDS_ISSUER` (AC-24) |
| `ATTACH_TO_BUILTIN` (rejected) | any `role_policies`/`policy_permissions` referencing an `is_builtin` parent | — | none | always refused (INV-06, AC-01) |
| `GATEWAY_STAMP_ACTOR` | mutation change-set | `authorize()` returned allowed | write `change_sets` row with `actorId = callerPrincipalId` (for a `tovu` CLI / core caller with no session/key, `callerPrincipalId` is the seeded `owner` principal — REQ-13, EC-12) | on `authorize()` deny: no change-set, 403 before idempotency (INV-04, EC-08) |
| `ENABLE_PRINCIPAL` **(0.6.0)** | `principalId` | principal exists, `status='disabled'`, `kind='user'`; caller holds `user.manage` | set `status='active'`, clear `disabledAt` | non-`user` target → 400 `VALIDATION_ERROR`, no change (AC-27, EC-14); missing `user.manage` → 403 (AC-27); no INV-08 interaction (enabling only ever raises the active owner-`*` count) |
| `UPDATE_USER` **(0.6.0)** | `principalId`, `email?` | user exists; caller holds `user.manage` **or** `member.manage` | set `users.email` (null if absent/empty, EC-17); `username`/`password` in the payload are ignored, not rejected | missing target → 404 `RESOURCE_NOT_FOUND`; missing gate → 403 (AC-28) |
| `RESET_USER_PASSWORD` **(0.6.0)** | `principalId`, `password` | user exists; caller holds **`user.manage`** (stricter than `UPDATE_USER` — `member.manage` alone is insufficient) | set `users.passwordHash` (argon2id); revoke **every** active `sessions` row for that `principalId` | missing target → 404; missing `user.manage` → 403; blank password → 400 `VALIDATION_ERROR` (AC-29, EC-16) |
| `UPDATE_ROLE` **(0.6.0)** | `roleId`, `name` | role exists, **not** `is_builtin`; caller holds `role.manage` | set `roles.name` | `is_builtin` target → 400 `VALIDATION_ERROR` (INV-06 extended); missing target → 404 (AC-30) |
| `UPDATE_POLICY` **(0.6.0)** | `policyId`, `name?`, `description?` | policy exists, **not** `is_builtin`, **not** `is_frozen`; caller holds `role.manage`; at least one of `name`/`description` present | set `policies.name`/`policies.description` | `is_builtin` or `is_frozen` target → 400 `VALIDATION_ERROR` (INV-06 extended / AC-26 parity); missing target → 404 (AC-30) |
| `DELETE_ROLE` **(0.6.0)** | `roleId` | role exists, **not** `is_builtin`; caller holds `role.manage`; **zero** `principal_roles` rows reference it (checked atomically with the delete, INV-09) | hard-delete the `roles` row | `is_builtin` target → 400 `VALIDATION_ERROR`; still-referenced → 409 `RESOURCE_CONFLICT`, no delete (AC-31, EC-15); missing target → 404 |
| `DELETE_POLICY` **(0.6.0)** | `policyId` | policy exists, **not** `is_builtin`, **not** `is_frozen`; caller holds `role.manage`; **zero** `role_policies` or `principal_policies` rows reference it (checked atomically with the delete, INV-09) | hard-delete the `policies` row (and any of its own `policy_permissions` rows — cascade within the deleted policy's own namespace only, never a different policy) | `is_builtin`/`is_frozen` target → 400 `VALIDATION_ERROR`; still-referenced → 409 `RESOURCE_CONFLICT`, no delete (AC-31, EC-15); missing target → 404 |

**Grant-writer note (v0.5.4, F-053):** the complete set of transitions that write grant rows is
`ISSUE_API_KEY` (→ `principal_policies`, sole writer of an api_key principal's grants, against a grantless
bound principal), `ASSIGN_ROLE` (→ `principal_roles`, human targets only), `ATTACH_POLICY` (→
`principal_policies`, human targets only), and `WRITE_POLICY_PERMISSION` (→ `policy_permissions`). All four
are INV-07-clamped. **`role_policies` has no user-facing writer in v1** (deferred, F-053-02). A machine
(`api_key`) principal's authority is a **frozen snapshot** taken at its single clamped issuance:
`ISSUE_API_KEY` copies the requested permissions into an `is_frozen=true` policy that
`WRITE_POLICY_PERMISSION` can never widen, so the key's effective set is genuinely immutable thereafter —
a later legal widening of any *source* policy does not reach the key (F-054-01).

**Surface note (revised 0.7.0 — corrects a 0.6.0 overstatement):** 0.6.0 asserted that "every
transition in this table has an HTTP route". That was **false when written**: `CREATE_PRINCIPAL` was
already in this table (since v0.5.1) and had no route in any version of api.spec.md, which made
`ISSUE_API_KEY` unreachable in practice — an `apikey.manage` holder could not produce the
`kind='api_key'` principal `ISSUE_API_KEY` is required to bind to. 0.7.0 closes that gap:
`CREATE_PRINCIPAL`'s surface is `APIKEY_PRINCIPAL_CREATE` (`POST /api/admin/v1/api-keys/principals`,
api.spec §1), chosen as a separate endpoint rather than folded into `APIKEY_ISSUE`'s body so that
AC-23's and AC-25a's caller-supplied-`principalId` preconditions stay expressible and independently
testable — see api.spec §1's Shape Rationale.

With that closed, the transitions with an HTTP route are: `CREATE_PRINCIPAL` (api.spec §1, 0.7.0);
`ISSUE_API_KEY`/`REVOKE_API_KEY`/`LOGIN`/`LOGOUT` (api.spec §1); and the 17 users/roles/policies
transitions (api.spec §1a) — of which `DISABLE_PRINCIPAL` and `WRITE_POLICY_PERMISSION` were
approved in v0.5.0/v0.5.3 but only gained a route in 0.6.0, while `CREATE_USER`/`CREATE_ROLE`/
`CREATE_POLICY`/`ASSIGN_ROLE`/`ATTACH_POLICY` already had routes before that amendment (the
"core/CLI operations in v1" framing this note carried before 0.6.0 was stale — see api.spec §0).
Deliberately surfaceless: `SEED_FIRST_BOOT` (boot-time), `GATEWAY_STAMP_ACTOR` (gateway-internal),
and `ATTACH_TO_BUILTIN` (a pseudo-transition that is always refused, INV-06 — it exists to name a
prohibition, not an operation). Where a transition runs through the SPEC-001 command gateway it is
subject to the same `authorize()` gate (api.spec §0).

## 4) Selector Contracts (Pure Derivations)
| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `resolveEffectivePermissions` | `principalId`, `workspaceId` | set of `PolicyPermission` rows = union of (roles→policies→permissions) and (principal_policies→permissions), scoped to workspace | empty set when principal holds no policy |
| `authorize` | `principalId`, `permission`, `{workspaceId, entityType?, entityId?}` | `{ allowed: boolean, reason: string }` | see § 5; fail-closed default `allowed=false` |
| `matchesRow` | one `PolicyPermission`, `permission`, context | boolean | true iff permission equals (or row is owner `*`) AND workspace equals AND (`resourceType` null OR == `entityType`) AND `constraintJson` null |
| `isCredentialActive` | session or api_key row + its principal | boolean | false if expired, revoked, or principal `status != active` (EC-02/EC-03) |

`authorize()` is ordinary core code, **not** a port (REQ-04, ADR-006). It is deterministic and
side-effect free given the DB snapshot.

## 5) State Invariants
- [ ] `authorize()` returns `allowed=true` **iff** ≥1 effective row matches per `matchesRow`; otherwise `allowed=false` (fail-closed) — INV-03.
- [ ] A `disabled` principal yields `allowed=false` (reason `principal_disabled`) regardless of grants — INV-03.
- [ ] The built-in `owner` policy's `*` row matches any `permission` in the same workspace; `*` never appears on a non-built-in policy — REQ-04.
- [ ] A non-null, uninterpretable `constraintJson` yields `allowed=false` (reason `unconstrained_deny`); a non-null `resourceType` with missing/mismatched `entityType` yields `allowed=false` (reason `resource_scope_mismatch`) — INV-03, EC-06.
- [ ] Every `change_sets.actorId` resolves to an existing `principals` row (active or disabled); no principal referenced by a change-set is ever hard-deleted — INV-02.
- [ ] No row references a parent in a different workspace (composite `(workspace_id, id)` FK) — INV-01.
- [ ] No `role_policies` or `policy_permissions` row references an `is_builtin` parent after seed — INV-06.
- [ ] An `is_frozen` policy (created only by `ISSUE_API_KEY`) never gains, loses, or changes a `policy_permissions` row after issuance; `WRITE_POLICY_PERMISSION` refuses it — so a `kind='api_key'` principal's effective permission set is fixed at its single clamped issuance and cannot grow when a source policy is later widened — INV-07/AC-26 (F-054-01).
- [ ] Raw passwords, raw API keys, session tokens, and their hashes never appear outside `password_hash` / `key_hash` / `token_hash` columns — INV-05.
- [ ] A key/session validates only while non-revoked, non-expired, and its principal is `active` — EC-02/EC-03. A session past its absolute `expires_at` fails `isCredentialActive` → 401, never reaching `authorize()` — EC-13.
- [ ] At least one `active` principal holding the owner `*` grant always exists after seed; no disable may reduce that count to zero (incl. self-disable), the seeded owner principal is never disabled, and the count-check+disable are one atomic transaction — INV-08.
- [ ] **(0.6.0)** A non-`is_builtin`, non-`is_frozen` role/policy is hard-deleted only when the reference check (`principal_roles` for a role; `role_policies`/`principal_policies` for a policy) and the delete run as one atomic operation with zero references observed — INV-09.

## 6) Acceptance Checklist
- [x] All transitions have explicit precondition and before/after behavior.
- [x] Selectors (`authorize`, `resolveEffectivePermissions`) are deterministic and side-effect free.
- [x] Entity fields and enums (`kind`, `status`, `resourceType`) align with `api.spec.md` and `errors.spec.md`.
- [x] Invariants are falsifiable statements mapped to INV-01..08.
