# Feature Spec: Settings (Core-Only Layered Ledger)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-007 |
| version | 0.3.1 |
| status | APPROVED |
| content_hash | sha256:fc322f69fe3cc586dbe9823c4d3d6d5225e419d538be554bdfe88873a40a501b |
| feature_name | FEAT-007-settings-core-ledger |
| last_edited | 2026-07-11T20:15:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

> **[NEEDS CLARIFICATION] vs Open Questions:** inline `[NEEDS CLARIFICATION]` markers block Software
> Architect dispatch; Open Questions carry an owner + date and do not block. This spec has zero
> inline clarification markers.

---

## Overview

Settings is the core admin capability for configuring site behavior across three layers — global
(site-wide), per-workspace, and per-user. It stores configuration in dedicated, schemas-as-data
tables that reuse the content model's write chokepoint and append-only revision discipline (ADR-022)
without inheriting the `entries` authority surface, so a delegated content agent can never flip
security-relevant configuration. This spec covers the **core-only subset** of ADR-028: the tables,
resolver, single write chokepoint, the `settings.*` permission catalog, core/site/theme definitions,
and a Settings admin screen.

---

## Problem Statement

**Current state:** The only configuration surface is a single-purpose `PresentationSettingsRepoPort`
(`src/features/presentation/*`) that stores one value — the active theme id — with no general
definition registry, no layered scopes, no revision ledger, and no permission catalog. Every other
setting is a hardcoded default. There is no admin screen to view or change configuration.

**Desired state:** A general Settings capability where core, the site, and themes register typed
setting definitions; operators read the effective value and per-layer overrides and change values at
permitted scopes through one authorized, revisioned write path; and the presentation active-theme
value becomes just one setting (`core.presentation.activeThemeId`) in this system.

**Why now:** ADR-028 was ACCEPTED 2026-07-11 after three audit rounds; it is the last of the decided
admin sections without an implementation, and several other sections (themes, backups) depend on a
real settings surface. No hard external deadline.

**Success signal:** An operator can, in a browser, view every core/site/theme setting grouped by
namespace, see its effective value and per-layer overrides, change a global/workspace/user value, and
reset a namespace to defaults — with every change producing an append-only revision — confirmed by
integration test. The active theme is served from `core.presentation.activeThemeId`.

---

## User Journey

1. **Trigger:** An operator opens the **Settings** admin section to change site configuration (for
   example, switch the active theme, or set a per-workspace override).
2. **Steps:**
   1. Navigates to Admin → Settings.
   2. The screen lists setting definitions grouped by namespace (`core.*`, `site.*`, `theme.*`).
   3. Selects a setting; the panel shows its effective value plus each present layer value
      (global / workspace / user) and the definition's default.
   4. Edits the value at a scope they are permitted to write, and saves.
   5. Optionally clicks "Reset to defaults" for a namespace.
3. **Outcome:** The new effective value is shown immediately; a toast confirms the save; the change
   is recorded as an append-only revision.
4. **Alternate paths:** If the operator lacks the scope's write permission, the save control is
   disabled and a server write is rejected `FORBIDDEN`. If the value fails the definition schema, the
   field shows an inline `VALUE_VALIDATION_FAILED` error and nothing is written. If they write to a
   scope the definition does not declare, the server rejects `SCOPE_NOT_ALLOWED`. An operator holding
   `settings.user.write` may first select a target principal in the screen; the `user`-scope edit then
   applies to that principal's layer instead of the operator's own.

Note: deterministic resolver precedence, rename/alias, retype ordering, reset semantics, and default
totality are specified in `behavior.spec.md`.

---

## Scope

**In scope:**
- The three-table-family data model: `setting_definitions`, `setting_values_global`,
  `setting_values_workspace`, `setting_values_user`, `setting_revisions` (state.spec.md).
- Schemas-as-data definition registry for `owner_kind ∈ {core, site, theme}` with namespace fencing.
- The resolver `getEffective` (precedence, totality, alias-transparency).
- The single write chokepoint `SettingsWriteService.set/clear` (authorize → validate → value+revision
  in one transaction).
- Definition lifecycle: rename (marker-row), retype, deprecate, tombstone; alias depth ≤ 1.
- The full `settings.*` permission catalog and the ledgered tenant/principal purge service.
- Retiring `PresentationSettingsRepoPort` into `core.presentation.activeThemeId`; theme presets →
  `theme.{themeId}`, including the one-time value migration.
- Admin HTTP API (register/getEffective/set/clear/reset) and the Settings admin screen.
- Per-layer cache with single-key invalidation; workspace-qualified definition cache.
- Target-principal membership validation for `settings.user.write` operations (REQ-13); no principal
  directory/search endpoint — the operator enters a raw identifier, validated on submit.

**Out of scope:**
- Plugin-owned settings, capability-checked plugin writes, and ADR-025 sandboxed settings panels —
  BLOCKED on capability-taxonomy-v1 (ADR-024 §6).
- The secret path (`secret:true` definitions) — BLOCKED on the Integrations/secret-store ADR; this
  subset rejects `secret:true` registration.
- Cross-site settings sync (Tovu-Runner, ADR-011).
- A background coercion-repair job (read-path coercion is in-scope; batch write-back repair is
  deferred).

---

## Requirements

- REQ-01: Settings persist only in the dedicated tables `setting_definitions`,
  `setting_values_global`, `setting_values_workspace`, `setting_values_user`, and `setting_revisions`
  in the per-site `content.db` — never in the `entries` table.
- REQ-02: `registerDefinitions` registers schemas-as-data definitions with `owner_kind ∈ {core, site,
  theme}` and rejects any definition whose namespace does not match its owner fence (`core.*` for
  core with null workspace, `theme.{id}` for theme, `site.*` with a non-null workspace for site).
- REQ-03: `getEffective(key, scopeContext)` returns the effective value using precedence
  `user ?? workspace ?? global ?? default`, is total (never throws and never returns undefined for a
  live key — worst case is the validated default), and resolves rename alias markers transparently.
- REQ-04: Every value mutation goes through the single `SettingsWriteService.set/clear` chokepoint,
  which calls `authorize()` first, validates the value against the definition schema, and writes the
  value row plus a `setting_revisions` row in the same database transaction.
- REQ-05: Definition-lifecycle operations — rename (marker-row mechanism), retype (version+1 with a
  registered coercer, deprecating the prior active version), deprecate, and tombstone — run through
  the chokepoint with same-transaction revisions; alias markers are `version=1`, point to an active
  definition, and alias depth never exceeds 1; rename and retype may not occur in one operation.
- REQ-06: A `settings.*` permission catalog governs every operation: per-scope value writes
  (`settings.global.write`, `settings.workspace.write`, `settings.user.self.write`,
  `settings.user.write`), `settings.definitions.manage`, `settings.reset.{global,workspace,user}`,
  and reads (`settings.read`, `settings.read.raw`, `settings.read.revisions`,
  `settings.read.definitions`). For scope=user operations, the required permission is
  `settings.user.write` when the request's `principalId` differs from the caller's own principal id,
  and `settings.user.self.write` when `principalId` is omitted or equals the caller's own id
  (behavior.spec.md §1.3).
- REQ-07: Tenant/principal teardown runs through a ledgered purge service that authorizes once,
  enumerates affected value rows, appends a redacted `op='purge'` revision per row, and deletes the
  rows in one transaction; value-table foreign keys are `ON DELETE RESTRICT` (never `CASCADE`) and the
  `setting_revisions` ledger is never cascade-deleted.
- REQ-08: The existing presentation-settings feature is retired into the ledger: the active theme id
  becomes the core definition `core.presentation.activeThemeId`, theme presets become `theme.{themeId}`
  definitions, a one-time migration writes existing presentation values into `setting_values_*` with
  revisions, and reads that previously used `PresentationSettingsRepoPort` route through the resolver.
- REQ-09: `registerDefinitions` rejects any definition with `secret: true` in this subset.
- REQ-10: The admin HTTP surface exposes register-definitions, get-effective, set, clear, and reset
  operations, each gated by the matching `settings.*` permission through `authorize()`.
- REQ-11: The Settings admin screen lists definitions grouped by namespace, shows each setting's
  effective value plus present per-layer values and default, lets a permitted operator set or clear a
  value at a scope and reset a namespace to defaults, and — for an operator holding
  `settings.user.write` — offers a target-principal identifier field (a validated id/email entry, not a
  browsable directory) to set or clear another principal's user-layer value, validated per REQ-13 on
  submit.
- REQ-12: Effective reads are served from a per-layer cache invalidated one key at a time on write;
  the definition cache is workspace-qualified so site-owned definitions never leak across workspaces.
- REQ-13: For any scope=user write or clear whose `principalId` differs from the caller, the write
  chokepoint validates that `principalId` resolves to an active `kind='user'` principal whose
  `workspace_id` equals the request's `workspaceId` (ADR-007 structural workspace scoping — a
  principal belongs to exactly one workspace, not a membership join) before authorizing or writing,
  rejecting `PRINCIPAL_NOT_FOUND` when it does not; no value row and no revision are written on
  rejection.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a registered setting, when a value is written at any scope, then a row
  appears only in the matching `setting_values_*` table and never in `entries`.
- AC-02 (REQ-02) [P1]: Given a core definition, when it is registered with namespace `core.presentation.*`
  and a null workspace, then registration succeeds.
- AC-03 (REQ-02) [P1]: Given a site-owned definition with a non-null workspace, when it is registered
  with namespace `core.foo`, then registration is rejected with `DEFINITION_INVALID`.
- AC-04 (REQ-03) [P1]: Given a setting with a value only at the global layer, when `getEffective` is
  called for a user context, then the global value is returned.
- AC-05 (REQ-03) [P1]: Given a setting with no value at any layer, when `getEffective` is called, then
  the definition's validated default is returned (never an error).
- AC-06 (REQ-03) [P1]: Given a setting renamed from key A to key B, when `getEffective` is called with
  key A, then the current effective value (as for key B) is returned.
- AC-07 (REQ-04) [P1]: Given a set at the workspace scope, when it commits, then exactly one
  `setting_values_workspace` row and exactly one `setting_revisions` row with `op='set'` exist for
  that change, written in the same transaction.
- AC-08 (REQ-04) [P1]: Given an unauthorized caller, when `set` is invoked, then it is rejected
  `FORBIDDEN` and no value row and no revision row are written.
- AC-09 (REQ-05) [P1]: Given a setting already retyped to version 2, when it is renamed, then the
  rename succeeds and an alias marker row with `version=1` is created at the old key.
- AC-10 (REQ-05) [P1]: Given a rename request whose new definition schema differs from the current
  one, when it is submitted, then it is rejected `RENAME_RETYPE_CONFLICT`.
- AC-11 (REQ-06) [P1]: Given an actor holding `settings.workspace.write` but not
  `settings.global.write`, when they set a global value, then it is rejected `FORBIDDEN`.
- AC-12 (REQ-07) [P1]: Given a workspace with setting values, when the ledgered purge service runs,
  then each deleted value row has a same-transaction `op='purge'` redacted revision and the prior
  revision rows remain in the ledger.
- AC-13 (REQ-07) [P2]: Given a workspace with setting values, when a raw `DELETE` on the workspace is
  attempted, then it is rejected by the `RESTRICT` foreign key and no value rows are deleted.
- AC-14 (REQ-08) [P1]: Given the migration has run, when the active theme is requested, then it is
  served from `core.presentation.activeThemeId` and equals the value the presentation feature held
  before migration.
- AC-15 (REQ-09) [P1]: Given a definition with `secret: true`, when `registerDefinitions` is called,
  then it is rejected `SECRET_NOT_SUPPORTED`.
- AC-16 (REQ-10) [P1]: Given each admin settings endpoint, when it is called without the matching
  `settings.*` permission, then it returns `403 FORBIDDEN`.
- AC-17 (REQ-11) [P1]: Given a setting with a workspace override, when the operator opens it in the
  Settings screen, then the screen shows the effective value, the global value, the workspace value,
  and the default distinctly.
- AC-18 (REQ-11) [P2]: Given a permitted operator on the Settings screen, when they change a value and
  save, then the new effective value is shown and a revision is recorded.
- AC-19 (REQ-12) [P2]: Given a global write to namespace `N`, when it commits, then only the
  `settings:global:N` cache key is invalidated and no per-tenant fan-out occurs.
- AC-20 (REQ-12) [P2]: Given two workspaces with the same site-owned definition key, when one
  workspace's definition cache entry is read, then it never returns the other workspace's definition.
- AC-21 (REQ-03) [P1]: Given a value stored under a stale `def_version`, when `getEffective` is called,
  then the value is coerced in memory to the current version and returned, with no write-back.
- AC-22 (REQ-11) [P2]: Given an operator holding `settings.user.write`, when they enter another
  principal's identifier in the Settings screen and set that principal's user-layer value, then the
  value is written to that principal's user layer and a revision is recorded.
- AC-23 (REQ-11) [P1]: Given an operator without `settings.user.write`, when they open the Settings
  screen, then no target-principal identifier field is offered, and a direct write attempt to another
  principal's user layer is rejected `FORBIDDEN`.
- AC-24 (REQ-13) [P2]: Given a set or clear at scope=user whose `principalId` does not resolve to an
  active principal whose own `workspace_id` equals the request's `workspaceId`, when the write
  chokepoint runs, then it is rejected `PRINCIPAL_NOT_FOUND` and no value row and no revision are
  written.
- AC-25 (REQ-06) [P1]: Given an operator holding `settings.user.self.write` but not
  `settings.user.write`, when they call `SETTINGS_SET` with `principalId` set to a different
  principal, then it is rejected `FORBIDDEN`.
- AC-26 (REQ-06) [P2]: Given an operator holding `settings.user.self.write` but not
  `settings.user.write`, when they call `SETTINGS_SET` with `principalId` omitted or equal to their
  own principal id, then it succeeds and a revision is recorded.

---

## Invariants

- INV-01: A `setting_values_*` row must never exist without a same-transaction `setting_revisions`
  row recording its creation or change.
- INV-02: `getEffective` for a live (non-tombstoned) key must never throw and must never return
  undefined — the worst-case result is the definition's validated default.
- INV-03: A setting's stored values must always remain addressable by its stable `setting_id` across
  renames; a rename must never orphan values, and resolving by the old or the new key must always
  yield the same effective value.
- INV-04: An alias marker row must always have `version=1` and must always point to an `active`
  definition, never to another alias — alias resolution depth must never exceed 1.
- INV-05: A site-owned definition (non-null `workspace_id`) must never carry the global scope bit and
  must never be registered outside the `site.*` namespace.
- INV-06: The `setting_revisions` ledger must always be append-only and must never be cascade-deleted;
  a tenant or principal teardown must always append a redacted `op='purge'` revision before deleting
  any value row.
- INV-07: Every `settings.*`-guarded operation must always call `authorize()` before it discloses or
  mutates any value (fail-closed) — with the sole documented exception that the reset orchestrator's
  inner per-key `clear()` runs in a reset-authorized internal context and still emits its revision.
- INV-08: `registerDefinitions` must never accept a definition with `secret: true` in this subset.
- INV-09: A `setting_values_user` row must never be written or remain addressable for a
  `(workspace_id, principal_id)` pair where `principal_id` does not, at write time, resolve to an
  active `kind='user'` principal whose own `workspace_id` equals that `workspace_id`.

---

## Edge Cases

- EC-01: What happens when `getEffective` is called for a key that has no value at any of the three
  layers? Expected behavior: the definition's validated default is returned; no error.
- EC-02: What happens when a value is written to a scope not present in the definition's `scopes`
  bitmask? Expected behavior: rejected `SCOPE_NOT_ALLOWED`; no value row and no revision are written.
- EC-03: What happens when a caller registers a definition with `secret: true`? Expected behavior:
  rejected `SECRET_NOT_SUPPORTED`; nothing is registered.
- EC-04: What happens when a site-owned definition declares the global scope bit? Expected behavior:
  rejected `DEFINITION_INVALID` at registration (INV-05).
- EC-05: What happens when a rename is attempted whose new schema differs from the current one (rename
  + retype in one op)? Expected behavior: rejected `RENAME_RETYPE_CONFLICT`.
- EC-06: What happens when a new alias marker would point at another alias (alias-to-alias)? Expected
  behavior: rejected `ALIAS_DEPTH_EXCEEDED`; sequential renames retarget prior markers to the newest
  active key in the same transaction.
- EC-07: What happens when a workspace holding setting values is deleted directly? Expected behavior:
  the `RESTRICT` foreign key blocks the delete (`PURGE_REQUIRED`); the ledgered purge service must run
  first.
- EC-08: What happens when `getEffective` reads a value stored under a stale `def_version`? Expected
  behavior: the value is coerced in memory to the current version and returned; no write-back occurs.
- EC-09: What happens when an actor holds `settings.reset.workspace` but not
  `settings.workspace.write` and resets a workspace namespace? Expected behavior: the reset succeeds;
  the inner `clear()` calls run in the reset-authorized internal context and still emit revisions.
- EC-10: What happens when `getEffective` is called for a tombstoned key? Expected behavior: the
  resolver returns the typed-absent result defined in the contract (never a stale value), surfaced as
  `DEFINITION_TOMBSTONED` on the write path.
- EC-11: What happens when a scope=user write or clear targets a `principalId` that does not exist or
  whose `workspace_id` does not equal the request's `workspaceId`? Expected behavior: rejected
  `PRINCIPAL_NOT_FOUND` (REQ-13); no value row and no revision are written.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| ADR-022 write chokepoint + revision discipline | The single-writer + append-only-revision pattern this feature reuses on its own tables | Cannot preserve never-brick guarantees | none — blocks feature |
| ADR-021 `authorize()` + flat permission strings | Fail-closed authorization for every operation | Writes could bypass authority | none — blocks feature |
| ADR-015 Drizzle + `content.db` (SQLite; Postgres next) | Rule-of-two persistence (in-memory + SQLite adapters) and composite-FK migrations | No durable persistence | in-memory adapter only (tests) |
| ADR-007 workspace scoping | `workspace_id` in value rows, cache keys, and the definition cache | Cross-tenant leakage | none — blocks feature |
| `src/features/presentation/*` (PresentationSettingsRepoPort) | The active-theme value migrated into `core.presentation.activeThemeId` | Migration cannot map legacy value | serve last-known default theme |
| ADR-020 theme system | The `theme.{themeId}` preset definitions and the active-theme consumer | Theme presets unavailable | presentation default |

---

## Open Questions

- OQ-01 — **RESOLVED 2026-07-11** (Coordinator `/clarify` pass): Should the Settings screen expose the
  revision history (per-setting audit view) in this iteration, or defer it to a later pass? —
  **Decision: Defer.** v1 ships set/clear/reset only; `setting_revisions` rows are still written on
  every change (REQ-04, INV-01) — a later spec adds the audit-view screen against that existing data.
  No REQ/AC change required. — Owner: Leon Aburime.
- OQ-02 — **RESOLVED 2026-07-11** (Coordinator `/clarify` pass): For `settings.user.write` (writing
  another principal's user layer), does the core-only subset ship an admin UI affordance, or is it
  API-only until a later pass? — **Decision: Ship a UI affordance now.** REQ-11 and AC-22/AC-23 add a
  target-principal selector gated by `settings.user.write`; see `ui.spec.md` `PrincipalSelector`. —
  Owner: Leon Aburime. **Follow-up:** Red-Team (2026-07-11) found 3 BLOCKING gaps in this addition
  (no principal validation/error code, no defined selector data source, ambiguous self-vs-other
  permission derivation) — resolved in v0.3.0 by REQ-13, AC-24/25/26, INV-09, EC-11, and by
  redefining `PrincipalSelector` as a validated identifier field rather than a directory picker (no
  new cross-spec dependency). See `red-team-findings.md`.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Reuses Drizzle (ADR-015), the ADR-022 chokepoint/validation language, and ADR-021 authorize(); no custom impl where a decided primitive exists. |
| II — Test-First | COMPLIES | TDD Agent certifies failing tests from these ACs/INVs/ECs before implementation; draft `src/features/presentation` is reconciled against certified tests, not treated as truth. |
| III — Simplicity Gate | COMPLIES | Every module (resolver, write service, purge service, repo port, admin screen) traces to a REQ; no SettingsPort service abstraction (one evaluator, REQ-10). |
| IV — Anti-Abstraction Gate | COMPLIES | `SettingsRepoPort` has the rule-of-two two adapters (in-memory + SQLite); no speculative plugin/secret abstractions (explicitly out of scope). |
| V — Integration-First Testing | COMPLIES | Every P1 AC is verifiable at the API/DB integration level (traceability seeds these). |
| VI — Security-by-Default | COMPLIES | Every operation is `authorize()`-gated (INV-07); no unauthenticated settings endpoint; secret path rejected (INV-08). |
| VII — Spec Integrity | COMPLIES | All package files carry spec_id SPEC-007 and the shared version/hash; validator enforces. |
| VIII — Observability | COMPLIES | Every write emits a `setting_revisions` row with actor + monotonic seq; errors carry structured payloads with correlationId (errors.spec.md). |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified against existing pipeline folders — SPEC-001…006 exist; 007 is next)
- [x] version set to correct semver
- [x] status set to APPROVED
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete
- [x] traceability.spec.md complete (rows seeded, pending implementation)
- [x] spec-manifest.md complete — all 10 logical files listed with PRESENT or OMITTED and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Planning Preflight
- [x] spec_mode is brownfield; brownfield evidence paths recorded in spec-manifest.md

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Preserve the ADR-022 chokepoint discipline on the new tables — every value/definition row change
  emits a same-transaction revision.

Ask before:
- Introducing any settings surface reachable by `content.write` or by a plugin/agent principal.

Never:
- Accept a `secret: true` definition, or add a raw settings write path that bypasses
  `SettingsWriteService`.
