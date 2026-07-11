# Behavior Rules Spec: Settings (Core-Only Layered Ledger)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-007 |
| feature_name | FEAT-007-settings-core-ledger |
| version | 0.3.1 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-11T20:15:00Z |

**Purpose:** Captures the deterministic resolver, lifecycle, and authorization rules that acceptance
criteria alone do not fully express. The resolver precedence and the rename/retype ordering are the
correctness core of this feature.

---

## EARS Syntax Guide

All rows in the Edge Case Handling table use EARS format (`WHEN`/`WHILE`/`IF … THEN`/`shall`). Vague
language ("should", "may") is not used.

---

## 1. Precedence Rules

### 1.1 Layer Resolution Precedence

**Situation:** When `getEffective(key, scopeContext)` computes the value a consumer sees.

**Sources in precedence order (highest to lowest):**
1. `user` layer (`setting_values_user` for `(workspace_id, principal_id)`) — the most specific override.
2. `workspace` layer (`setting_values_workspace` for `workspace_id`) — tenant-level override.
3. `global` layer (`setting_values_global`) — site-wide value.
4. `default` (`setting_definitions.default_json`) — the fallback when no layer has a non-cleared value.

**Example:**
- Scenario: a setting has a global value `"light"` and a workspace value `"dark"`, resolved for a user in that workspace.
- Result: `"dark"` — the workspace layer wins over global; the user layer is absent.

**Test requirement:** The TDD Agent must write a test for each adjacent pair of competing layers and for the all-absent case.

### 1.2 Cleared-State Precedence

**Situation:** When a layer has a row in `state='cleared'`.

**Rule:** A `cleared` row is treated as "no value at this layer" for precedence — resolution falls through to the next lower layer. A `cleared` row is distinct from a stored JSON `null` value, which is a real value only if the schema admits null.

---

### 1.3 Self vs. Other Permission Derivation (scope=user)

**Situation:** When a caller invokes `SETTINGS_SET`/`SETTINGS_CLEAR` at `scope=user` and the server must
choose which permission to require.

**Rule:** The server compares the request's `principalId` to the caller's own principal id.
- If `principalId` is omitted, or is present and equals the caller's own principal id, the required
  permission is `settings.user.self.write`.
- If `principalId` is present and differs from the caller's own principal id, the required permission
  is `settings.user.write`. Holding `settings.user.self.write` alone is never sufficient for this case.

**Rationale:** This is the sole rule the write chokepoint uses to pick between the two `scope=user`
permissions (REQ-06); it removes the ambiguity in `AUTH_WRITE_SCOPED`'s "matching the request scope"
description flagged by Red-Team RT-003.

**Test requirement:** The TDD Agent must write a test for a `settings.user.self.write`-only holder
targeting (a) their own principal (succeeds, AC-26) and (b) another principal (rejected `FORBIDDEN`,
AC-25).

## 2. Ordering Rules

### 2.1 Definition Listing Order

**Field used for sorting:** `namespace` ascending, then `key` ascending.

**Direction:** Ascending.

**Stability:** Stable; ties are impossible because `(namespace, key)` is unique per active definition per workspace partition.

**When overridden:** Never in this subset — the admin screen groups by namespace and sorts keys ascending.

**Invariant:** Definition listings must always be ordered by `(namespace, key)` ascending.

### 2.2 Revision Ordering

**Context:** When revisions for a setting are read.

**Order:** Ascending by `seq` (monotonic autoincrement); `seq` is the total order of all settings mutations.

**Tie-break:** None required — `seq` is unique.

**Invariant:** No revision may be reordered or skipped; the ledger is append-only.

### 2.3 Sequential Rename Retarget Ordering

**Context:** When a setting is renamed A→B and later B→C.

**Order:** In the B→C transaction, the active definition's `(namespace,key)` is updated to C first, then all prior alias markers (including the A marker) are retargeted to C in the same transaction.

**Invariant:** After any rename chain, every alias marker points directly to the current active key (depth ≤ 1); no marker points to another marker.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `scope` (write) | SETTINGS_SET / SETTINGS_CLEAR | none (required) | Ambiguous scope must be explicit — silently defaulting a scope could write the wrong layer. |
| `secret` | definition registration | `false` | The secret path is out of scope; the safe default is non-secret, and `true` is rejected. |
| `op` | definition registration | `register` | The common case is a first registration; lifecycle ops are explicit. |
| `value state` | new value row | `set` | A written row represents a present value; `cleared` is only reached by an explicit clear. |
| `sourceLayer` (resolved) | getEffective result | `default` | When no layer has a value, the resolver reports `default` so consumers can distinguish inherited from overridden. |
| resolver missing-value result | getEffective | validated `default_json` | Totality (INV-02): a live key always resolves to a concrete value. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| `scopes` bitmask range | 1..7 | API + DB CHECK | global=1, ws=2, user=4; 0 and >7 rejected `DEFINITION_INVALID`. |
| Alias depth | ≤ 1 | write chokepoint | Alias-to-alias rejected `ALIAS_DEPTH_EXCEEDED`. |
| Definition versions | monotonic +1 on retype | write chokepoint | Prior active flipped to `deprecated` in the same tx. |
| Rate limit: write operations | 30 req / 60s per user | API | See api.spec.md `WRITE_STANDARD`. |
| Rate limit: read operations | 300 req / 60s per user | API | See api.spec.md `READ_STANDARD`. |
| `secret` accepted values | `false` only | API | `true` rejected `SECRET_NOT_SUPPORTED`. |
| Non-secret `default_json` | must be non-null | registration | Totality proof for factory reset (INV-02). |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate Definition

A registration is a duplicate of an existing definition if it targets the same `(namespace, key)` in
the same workspace partition (`COALESCE(workspace_id, '*')`) while an `active` or `alias` row already
occupies that slot.

**Not a duplicate if:** The existing row is `deprecated` or `tombstone`.

### 5.2 How Duplicates Are Handled

**At registration:** A duplicate `register` op targeting an occupied active slot is idempotent when the
schema is byte-identical (no-op, no new revision); a differing schema on the same key is a `retype`,
not a `register`, and must be submitted as `op=retype`.

**At value write:** Values are upserts keyed by `(scope-key, setting_id)`; a second write to the same
scope replaces the value and appends a new `op='set'` revision. There is no value-level duplicate error.

---

## 6. Tie-Break Logic

### 6.1 Two Layers Present at Different Scopes

**When does this apply:** When more than one layer holds a non-cleared value for the same key.

**Tie-break rule:** Strict precedence (§1.1) decides — the higher layer always wins. There is never a
"same-priority tie" because the three layers are totally ordered.

**Rationale:** A total order over exactly three named layers removes ambiguity without a counter or timestamp compare.

**Invariant:** Identical layer states always resolve to the same effective value (determinism).

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| No layer has a value for a live key | The resolver shall return the definition's validated `default_json`. | Yes |
| A value is written to a scope not in `scopes` | IF the target scope bit is not set in the definition's `scopes`, THEN the write chokepoint shall reject `SCOPE_NOT_ALLOWED` and write no row and no revision. | Yes |
| A definition is registered with `secret: true` | IF `secret` is true, THEN registration shall reject `SECRET_NOT_SUPPORTED`. | Yes |
| A site-owned definition declares the global scope bit | IF `workspace_id` is non-null AND the global bit is set, THEN registration shall reject `DEFINITION_INVALID`. | Yes |
| A rename carries a changed schema (rename+retype in one op) | IF a rename op's schema differs from the current active schema, THEN it shall reject `RENAME_RETYPE_CONFLICT`. | Yes |
| A new alias marker would point to another alias | IF the rename target resolves to an alias, THEN it shall reject `ALIAS_DEPTH_EXCEEDED`. | Yes |
| A workspace with values is deleted directly | IF a raw workspace DELETE is attempted while value rows reference it, THEN the RESTRICT FK shall block it (`PURGE_REQUIRED`). | Yes |
| A value under a stale `def_version` is read | WHEN `getEffective` reads a value whose `def_version` is older than the active version, the resolver shall coerce it in memory using the registered coercer and shall not write back. | Yes |
| Reset by an actor with `settings.reset.*` but not `*.write` | WHILE the reset orchestrator runs, WHEN it calls the inner `clear()`, the system shall authorize the clear in the reset-authorized internal context and shall still emit an `op='clear'` revision. | Yes |
| `getEffective` for a tombstoned key | WHEN the resolved definition is `tombstone`, the resolver shall return the typed-absent result and shall not return a stale value. | Yes |
| A global write to namespace N | WHEN a global value in namespace N commits, the cache shall invalidate only the `settings:global:N` key and shall not fan out per tenant. | Yes |
| A scope=user write/clear targets a `principalId` that does not exist or whose `workspace_id` differs from the request's `workspaceId` | IF the target `principalId` does not resolve to an active `kind='user'` principal whose own `workspace_id` equals the request's `workspaceId` (ADR-007 structural scoping), THEN the write chokepoint shall reject `PRINCIPAL_NOT_FOUND` and shall write no value row and no revision. | Yes |
