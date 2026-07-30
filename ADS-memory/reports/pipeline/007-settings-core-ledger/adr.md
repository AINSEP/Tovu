# ADR-PIPE-007: Settings (Core-Only Layered Ledger) — Implementation Architecture

- Status: ACCEPTED 2026-07-11 (human approval: Leon Aburime, via Coordinator walkthrough — approved with acknowledged uncertainty; reversible if the module layout or migration plan needs revision once implementation starts)
- Date: 2026-07-11
- Spec: SPEC-007 v0.3.1 (hash: sha256:fc322f69fe3cc586dbe9823c4d3d6d5225e419d538be554bdfe88873a40a501b)
- Author: Software Architect Agent (Coordinator, sequential single-agent mode)

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Drizzle/SQLite (ADR-015) for persistence; no new library. Principal-membership check reuses `PrincipalRepoPort` from `src/identity/ports.ts` — no new client/library needed. |
| II — Test-First | COMPLIES | No implementation exists yet; TDD Agent certifies failing tests from SPEC-007's ACs/INVs/ECs before Programmer writes code. Draft `src/features/presentation/*` is reconciled against certified tests (spec-manifest.md brownfield references), never treated as ground truth. |
| III — Simplicity Gate | COMPLIES | Every module below traces to a REQ (see Module/Service Boundaries). No speculative generality — e.g., the target-principal check reuses an existing port rather than adding a directory/search subsystem (RT-002 resolution). |
| IV — Anti-Abstraction Gate | COMPLIES | `SettingsRepoPort` ships the rule-of-two (`repo.memory.ts` + `repo.sqlite.ts`, matching `presentation`/`identity` precedent). REQ-13's principal check deliberately does **not** introduce a new `PrincipalDirectoryPort` — it calls the existing `PrincipalRepoPort.findById` already used by `identity`. No `SettingsPort` service-abstraction layer (ADR-028 §8, one evaluator). |
| V — Integration-First Testing | COMPLIES | Every P1 AC has an HTTP-route or DB-adapter boundary (admin routes, SQLite adapter) where integration coverage applies; traced in traceability.spec.md §1. |
| VI — Security-by-Default | COMPLIES | Every admin route is `authorize()`-gated (INV-07); the constitution's standing Art. VI local-dev-only exception (no auth layer yet) already covers this server generally and is unchanged by this feature. `secret:true` registration is hard-rejected (INV-08). |
| VII — Spec Integrity | COMPLIES | This ADR and all downstream artifacts cite SPEC-007 v0.3.1, hash `sha256:fc322f6…5ccd`. |
| VIII — Observability | COMPLIES | Every write emits a `setting_revisions` row carrying `actor` + monotonic `seq` (ADR-028 §2); error payloads carry `correlationId` (errors.spec.md §1). |

No EXCEPTION rows. Complexity Justification table is empty.

## Research Summary

- Research artifact: N/A — no library, framework, or persistence-mechanism choice is open. Persistence is Drizzle/SQLite per ADR-015 (already decided); the write-chokepoint/revision pattern is ADR-022 (already decided); authorization is ADR-021's `authorize()` (already decided). The one genuinely open implementation question — how REQ-13's target-principal check is satisfied — is a **reuse-vs-build** call resolved in Pattern Evaluation below, not a technology choice.
- Key decision: N/A (see above).

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS (validator `--phase preflight`, 2026-07-11T20:25:00Z, against spec hash `sha256:fc322f69fe3cc586dbe9823c4d3d6d5225e419d538be554bdfe88873a40a501b`)
- Spec hash verified at: 2026-07-11 (provider-local validator, `--phase spec --update-hash`, post-Red-Team-fix precision pass)
- Red-Team status and artifact: PASS (0 BLOCKING after confirm-pass), 1 ADVISORY (RT-004, rate-limit note) carried forward — `ADS-memory/reports/pipeline/007-settings-core-ledger/red-team-findings.md`
- System Blueprint status and artifact: Not produced for this feature (no macro-topology change — Settings is a new feature module inside the existing modular-monolith admin server, not a new service/deployment boundary)
- CodeBase Analyzer reports consumed: None formal; this ADR performed direct source inspection of `src/features/presentation/*`, `src/identity/{ports.ts,permissions.ts,seed.ts}`, `src/infra/db/schema.ts`, `src/server/{app.ts,seed.ts}`, `apps/admin/src/{App.tsx,sections/*.tsx}` to ground module boundaries and naming conventions in actual repo precedent rather than inventing structure.
- Reverse-spec artifacts consumed: None (SPEC-007 is brownfield via spec-manifest.md's Brownfield References section, not a reverse-spec extraction).
- Validator result or waiver: PASS, no waiver needed (python3 available).

## Context

SPEC-007 needs to become buildable tasks. The **architecture is already decided** — ADR-028 (ACCEPTED 2026-07-11, 3-round audited swarm debate) specifies the full data model (DDL), resolver precedence, single write chokepoint, permission catalog, cache design, and purge service for the core-only Settings subset. This ADR does not re-litigate ADR-028; it does the work ADR-028 deliberately left to the Software Architect stage:

1. **Concrete module/file boundaries** inside this specific codebase (ADR-028 is stack-agnostic DDL + prose; this repo has an established feature-module convention — `src/features/<name>/{<name>.ts, ports.ts, repo.memory.ts, repo.sqlite.ts}` plus `src/server/routes/admin/<name>/<action>.ts` — that Settings must follow, not invent).
2. **A design decision ADR-028 didn't need but SPEC-007's Red-Team-fixed v0.3.0/v0.3.1 addition does**: REQ-13's target-principal validation (added after Red-Team RT-001) needs an implementation seam. ADR-028 predates this requirement.
3. **Migration safety** for retiring `PresentationSettingsRepoPort` (REQ-08) — required because SPEC-007 is brownfield (spec_mode: brownfield) and this repo already has consumers of the port being retired (`src/core/commands/appliers.ts`, `src/server/seed.ts`, `src/navigation/ports.ts` per spec-manifest.md's Brownfield References).
4. **A parallel delivery plan** so `/tasks` can safely mark slices `[P]`.

## Decision

Adopt ADR-028's core-only-subset design (DDL, resolver, chokepoint, permission catalog, cache, purge service) as the persistence and domain architecture for SPEC-007, implemented as a new `src/features/settings/` feature module following this repo's established feature-module convention (mirrors `src/features/presentation/`, `src/identity/`). REQ-13's target-principal validation reuses the existing `PrincipalRepoPort.findById` from `src/identity/ports.ts` — no new port. The UI ships as a single `apps/admin/src/sections/Settings.tsx` file, mirroring the existing flat-file convention for every other admin section (`Members.tsx`, `Menus.tsx`, etc.), internally composed of the components ui.spec.md defines. `PresentationSettingsRepoPort` and its call sites are retired via an expand/contract migration (see Migration Safety).

**Pattern(s) selected:** Hexagonal ports-and-adapters at the persistence boundary (rule-of-two: in-memory + SQLite adapters, per ADR-006/ADR-028 §8) inside a modular-monolith feature module — inherited unchanged from ADR-028/ADR-022/ADR-021 precedent, not a new pattern choice.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS
- Notes: `src/features/settings/` is a vertical feature slice, consistent with every existing feature module. The hexagonal seam at persistence (`SettingsRepoPort`) is justified by ADR-028's own rule-of-two mandate (in-memory tests + SQLite production) — the same justification every other repo port in this codebase already carries; it is not additional ceremony. The admin UI screen stays a single flat file per the repo's actual convention (confirmed by inspecting `Members.tsx`/`Menus.tsx`, both single-file, no nested FSD folders) rather than introducing a heavier structure the rest of `apps/admin` doesn't use — a case where the *simpler* choice is also the one that matches established precedent.

## Rationale

Map the decision to the system drivers:
- **Driver: reuse ADR-022's chokepoint/revision discipline without inheriting `entries`' authority surface** (the reason ADR-028 exists) → addressed by ADR-028's dedicated tables + `SettingsWriteService.set/clear` as the sole write path; this ADR keeps that chokepoint as a single exported module (`write-service.ts`) with repo methods package-private, enforcing "no side door" at the TypeScript module boundary, not just by convention.
- **Driver: REQ-13's target-principal validation must not invent a new identity subsystem** (Red-Team RT-002: no phantom dependency) → addressed by reusing `PrincipalRepoPort.findById({workspaceId, id})`, which already returns `null` for a principal that doesn't exist in that workspace — exactly the `PRINCIPAL_NOT_FOUND` predicate REQ-13 needs, with zero new abstraction.
- **Driver: brownfield retirement of `PresentationSettingsRepoPort` must not brick existing consumers mid-flight** → addressed by an expand/contract migration (write both, read new, then delete old) detailed in Migration Safety.
- **Driver: `/tasks` needs safe `[P]` parallelization** → addressed by the parallel delivery plan below, sequencing schema/chokepoint work ahead of the API/UI slices that depend on it.

## Pattern Evaluation

The core persistence/domain pattern (hexagonal ports-and-adapters, single write chokepoint, rule-of-two) is **inherited from ADR-028/ADR-022/ADR-021/ADR-006** and is not re-evaluated here — re-litigating an audited, 3-round-debated, ACCEPTED governance ADR would violate "fix upstream intent, not downstream drift" and add no information. The one genuinely open implementation-level choice this ADR makes is **how REQ-13's target-principal check is satisfied**:

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Reuse existing `PrincipalRepoPort.findById` (identity module) | Strong fit | High | measured (read the actual port signature in `src/identity/ports.ts`) | Zero new abstraction (Art. IV); `findById({workspaceId, id})` already returns `null` for a workspace/principal mismatch — exact match for REQ-13's predicate; no cross-module directory/search endpoint needed (closes Red-Team RT-002 at the implementation level too) | Creates a read-time dependency from `settings` → `identity` (acceptable: `identity` is already a foundational module every feature depends on for `authorize()`) | None significant — this is the same dependency direction every other feature already has on `identity` | **SELECTED** |
| New `PrincipalDirectoryPort` scoped to `settings` | Weak fit | Low | analogical | Would let `settings` evolve its principal-lookup shape independently | Duplicates `PrincipalRepoPort`'s exact capability; violates Art. III/IV (a second port for one already-solved lookup); Red-Team RT-002 explicitly flagged inventing new principal-lookup surface as scope creep | None that justify the duplication | Not selected — pure duplication of an existing capability |
| Inline SQL query against `principals` table from `settings`' repo adapter | Rejected | Low | analogical | Avoids any cross-module import | Bypasses the `identity` module's own abstraction boundary; two code paths could read `principals` differently over time; no adapter-swap safety if `principals`' storage changes | Couples `settings`' SQLite adapter directly to `identity`'s table shape instead of its port | Not selected — violates modular-monolith module boundaries for no benefit |

## Quality Attribute Scorecard

Most axes are governed by ADR-028's own scorecard (security, reliability, cost — unchanged, since this ADR adds no new tables/chokepoints beyond what ADR-028 specifies). Scored here for the concrete surface this ADR adds: the module wiring, the REQ-13 seam, and the UI screen.

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of changing settings behavior later | 4 | measured | Feature module isolated behind `SettingsRepoPort`; write chokepoint is one file | UI screen is a single flat file that will grow with 8 components (matches repo convention but risks size) | Matches every other feature module's shape; a future split of `Settings.tsx` is a non-breaking internal refactor | Repo convention (flat section files) stays acceptable at this screen's complexity | always-on | If `Settings.tsx` exceeds ~400 lines, Programmer may split into local sub-files under a `sections/settings/` folder without changing the public route contract | Owner: Programmer; trigger: file exceeds ~400 lines | — |
| modularity | Cross-module coupling | 4 | measured | `settings` depends only on `identity` (for `authorize()` and `PrincipalRepoPort`) and `core` (ports/types) — same dependency shape as every other feature | New read dependency on `identity.PrincipalRepoPort` | Reusing an existing port is the *lower*-coupling option vs. building a parallel lookup | — | always-on | — | — | +1 vs the rejected "new port" alternative, which would add a second identity-adjacent seam |
| scalability | Read/write volume headroom | 4 | prior_art | Per-layer cache with single-key invalidation (ADR-028 §8) inherited unchanged | None new | No new scaling concern introduced by this ADR | ADR-028's cache design holds | always-on | — | — | — |
| reliability | Never-brick / correctness under failure | 5 | measured | Chokepoint + same-tx revisions (INV-01), RESTRICT FKs (never CASCADE), provable factory-reset default totality (INV-02) — all ADR-028, unchanged | None new | Inherited guarantees; this ADR adds no new failure mode beyond REQ-13's validated-and-tested `PRINCIPAL_NOT_FOUND` path | — | always-on | — | — | — |
| security | Authorization correctness | 4 | measured | Explicit self-vs-other permission derivation rule (behavior.spec §1.3) closes an ambiguity Red-Team caught (RT-003); REQ-13 closes a target-principal validation gap (RT-001) | The self-vs-other derivation is a security-relevant conditional that must be implemented exactly as specified — a single-file, well-tested pure function reduces but doesn't eliminate implementation-error risk | Both Red-Team-driven fixes are now explicit, testable rules (AC-24/25/26), not implicit conventions | — | always-on | Implement `deriveRequiredPermission()` as an isolated pure function with its own unit tests (AC-25/AC-26) before wiring into the chokepoint, so TDD can certify it independently of the DB path | Owner: TDD Agent; trigger: before Programmer wires the chokepoint | — |
| operability | Ops/debugging surface | 4 | prior_art | Structured errors + `correlationId` (errors.spec.md), revision ledger gives full audit trail | None new | Inherited from ADR-022/028 | — | always-on | — | — | — |
| cost | Build/run cost | 5 | measured | No new infrastructure; SQLite, existing server process, no new service | None | Pure feature-module addition to an existing modular monolith | — | always-on | — | — | — |
| testability | Ease of certifying behavior | 5 | measured | Every REQ/AC/INV/EC in SPEC-007 is written Given/When/Then against pure functions + a repo port with an in-memory adapter — TDD can certify the full domain layer without a database | None | Matches this repo's established test-first pattern (`identity`, `presentation` both test the pure core against `repo.memory.ts`) | — | always-on | — | — | — |

No axis scored ≤2; Mitigations Required section is empty except the two forward-looking notes captured inline above (file-size split trigger; isolate the permission-derivation function for independent certification).

## Overall Strengths

- Every new module traces directly to a REQ; nothing is speculative.
- REQ-13's hardest question (how does Settings know a principal is real) is answered by reusing an existing, already-tested port — net-new surface is small.
- The write chokepoint is enforced by TypeScript module boundaries (package-private repo methods), not just code review discipline.

## Overall Weaknesses

- The admin screen is inherently the most complex single-file section in `apps/admin` to date (8 ui.spec.md components vs. `Members.tsx`'s single list); the flat-file convention will be stretched further than it has been before.
- REQ-13 and the self-vs-other permission rule are both security-relevant and both new in this pass (post-Red-Team) — they carry more implementation-correctness risk than the rest of the feature, which is a straightforward application of the already-audited ADR-028 pattern.

## Tradeoff Tension

We are trading a slightly oversized single UI file (`Settings.tsx`) for consistency with every other admin section, rather than introducing a bespoke nested-component convention for this one screen.

## Why This Won

Matching the existing repo convention (flat section files, reuse `PrincipalRepoPort`, no new abstractions) keeps Settings unsurprising to the next engineer who has already worked in `Members.tsx` or `identity/ports.ts`. The alternative — inventing cleaner-looking but novel structure for this one feature — would violate Article III (traces-to-requirement) and Default Heuristic Alignment (avoid unnecessary ceremony for a feature this size), for a benefit (marginally shorter files) that doesn't offset the cost of a second convention living alongside the first.

## Runner-Up Comparison

- Runner-up: A dedicated `PrincipalDirectoryPort` for Settings' target-principal lookup, plus a nested `apps/admin/src/sections/settings/*.tsx` component tree.
- Why it lost: Both pieces add abstraction/structure this feature's actual complexity doesn't justify yet (Art. III/IV), and the directory-port option specifically reintroduces the exact scope-creep Red-Team RT-002 already ruled out at the spec level — carrying that same reasoning into the architecture would be inconsistent.

## Consequences

**Positive:**
- Settings is trivially navigable by anyone already familiar with `presentation` or `identity`'s module shape.
- REQ-13 ships with zero new cross-module contracts — the entire principal-check surface is one function call to an existing, tested port.
- The write chokepoint's package-private repo methods make "no side door" a compile-time property, not just a review checklist item.

**Negative / Tradeoffs:**
- `Settings.tsx` will likely be the largest single admin-section file in the codebase; if it becomes unmaintainable, a later refactor to a nested folder is expected and is explicitly pre-approved by this ADR (see modifiability mitigation) rather than being a constitution violation when it happens.
- `settings` now has a read dependency on `identity` beyond the universal `authorize()` dependency every feature already has (specifically `PrincipalRepoPort`) — acceptable, but it is a new edge in the module dependency graph worth naming for Code Review's architecture audit.

**Risks:**
- Risk: The self-vs-other permission derivation (behavior.spec §1.3) is implemented inconsistently between the route layer and the chokepoint → plan: TDD Agent certifies `deriveRequiredPermission()` as an isolated, directly-testable pure function (AC-25/AC-26) before the Programmer wires it into `write-service.ts`, so there is one source of truth, not a rule re-implemented at two layers.
- Risk: The `PresentationSettingsRepoPort` migration (REQ-08) ships incompletely, leaving some consumer still reading the old port → plan: see Migration Safety's Point of No Return row — the old port's file is deleted only after all three named consumers are re-pointed and the reconciliation check passes.

## Mitigations Required

None — no axis scored ≤2. The forward-looking notes above (file-size split trigger; isolate `deriveRequiredPermission()`) are Owner/Enforcement-tagged mitigations already captured inline in the Quality Attribute Scorecard, not separate open items.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | **Expand:** new `setting_definitions`/`setting_values_*`/`setting_revisions` tables land alongside the existing `presentation_settings` table (ADR-028 §2 DDL, applied via Drizzle migration in `src/infra/db/schema.ts`). A one-time migration function seeds `core.presentation.activeThemeId` (global scope) from every existing `presentation_settings` row, each write going through `SettingsWriteService.set` (so it gets a normal `op='set'` revision — REQ-08 requires this, not a raw INSERT). **Contract:** once migrated, `src/core/commands/appliers.ts`, `src/server/seed.ts`, and `src/navigation/ports.ts` are re-pointed from `PresentationSettingsRepoPort` to `getEffective('core.presentation.activeThemeId', …)`. Only after all three are re-pointed and verified does the old port/table get removed. | Programmer (migration script), Software Architect (contract), Code Review (verifies all three consumers moved) |
| Dual-write or read-routing plan | No dual-write window is needed — this is a one-time value migration (small row count: one `presentation_settings` row per workspace), not an ongoing sync. The migration runs once at boot (in `src/server/seed.ts`'s existing seed path, alongside where `presentation_settings` is currently seeded) before any request can read through the new resolver. | Programmer |
| Backfill plan | The migration function reads every existing `presentation_settings` row and writes it as `core.presentation.activeThemeId` via the chokepoint; theme presets similarly backfill as `theme.{themeId}` definitions per REQ-08. Idempotent: reruns are safe because `SettingsWriteService.set` upserts (ADR-028 §2 value tables have `setting_id` as PK — a rerun overwrites with the same value, harmless). | Programmer |
| Reconciliation checks | Before the old port is deleted, an integration test asserts: for every workspace, `getEffective('core.presentation.activeThemeId', …)` returns the same value the old `PresentationSettingsRepoPort.findByWorkspaceId` would have returned pre-migration (AC-14). | TDD Agent / Code Review |
| Observability proving phase health | The migration's writes are ordinary `SettingsWriteService.set` calls — they emit normal `setting_revisions` rows with `op='set'`, so the ledger itself is the audit trail proving the migration ran and what it wrote; no separate migration-specific telemetry is needed. | Programmer |
| Rollback test | Because the old `presentation_settings` table and `PresentationSettingsRepoPort` are **not deleted** until after the three consumers are re-pointed and verified (see Point of No Return), rollback before that point is simply: don't re-point the consumers / don't remove the old code path. No data-destructive step happens before verification. | Software Architect (this decision), Programmer (execution) |
| Cutover approval and timing | Cutover = re-pointing the three named consumers from the old port to the resolver. This can happen in the same PR as the migration (small, low-risk consumer set, already enumerated exhaustively in spec-manifest.md's Brownfield References) — no separate approval gate beyond normal Code Review. | Coordinator / Code Review |
| Point of no return | Deleting `src/features/presentation/{repo.memory.ts,repo.sqlite.ts,presentation.ts}` and the `presentation_settings` table/schema entry. This step is explicitly **deferred to a follow-up task**, not this feature's task list — SPEC-007's scope is migrating the *value* and *consumers*, not deleting the legacy module in the same pass (reduces this feature's blast radius; the dead code is inert once consumers are re-pointed and can be removed independently once the team is confident). | Coordinator (schedules the follow-up) |
| Post-cutover verification | AC-14's integration test (see Reconciliation checks) plus a manual `/verify`-style pass confirming the Settings admin screen shows the correct active theme per workspace after migration. | TDD Agent, then human/`/verify` |

## Re-evaluation Triggers

- Calendar trigger: None — this is a core-only, already-audited design; no forced revisit date.
- Scale trigger: If a single workspace accumulates more than a few thousand `setting_definitions` rows, revisit whether `NamespaceGroupList`'s client-side grouping (ui.spec.md §1) still performs acceptably, or whether server-side pagination is needed (out of scope for this ADR).
- Topology trigger: If Settings ever needs to run as a separate service (not currently planned), the `SettingsRepoPort` boundary already makes that extraction straightforward — re-evaluate the module boundary at that time, not now.
- Dependency trigger: If `identity`'s `PrincipalRepoPort.findById` signature changes (e.g., adds required params), `settings`' REQ-13 call site must be updated in lockstep — Code Review should flag `identity/ports.ts` changes that touch `PrincipalRepoPort` as needing a `settings` module check.

## Module / Service Boundaries

```
src/features/settings/                    # NEW feature module (REQ-01..13)
  INFO.md                                 # module purpose, mirrors presentation/identity INFO.md convention
  settings.ts                             # pure domain core: registerDefinitions, getEffective/getLayer/
                                           #   resolveDefinition (resolver, REQ-03), lifecycle ops
                                           #   (rename/retype/deprecate/tombstone, REQ-05) — the "one
                                           #   evaluator" (ADR-028 §8), not split into a separate port
  write-service.ts                        # SettingsWriteService.set/clear — THE chokepoint (REQ-04).
                                           #   Exports only set/clear/registerDefinitions/reset entry
                                           #   points; repo write methods are package-private (imported
                                           #   only within this module). Contains
                                           #   deriveRequiredPermission() (behavior.spec §1.3, REQ-06) as
                                           #   an isolated, independently-testable pure function, and the
                                           #   REQ-13 target-principal check (calls identity's
                                           #   PrincipalRepoPort.findById — no new port).
  purge-service.ts                        # ledgered tenant/principal purge (REQ-07)
  errors.ts                               # DefinitionInvalidError, ScopeNotAllowedError,
                                           #   SecretNotSupportedError, PrincipalNotFoundError (NEW,
                                           #   REQ-13), RenameRetypeConflictError, AliasDepthExceededError,
                                           #   DefinitionTombstonedError, PurgeRequiredError — mirrors
                                           #   PresentationSettingsNotFoundError-style typed errors
  ports.ts                                # SettingsRepoPort (rule-of-two: memory + sqlite adapters).
                                           #   Deliberately does NOT declare a principal-lookup method —
                                           #   that's identity's PrincipalRepoPort, imported directly.
  repo.memory.ts                          # in-memory adapter (tests)
  repo.sqlite.ts                          # Drizzle/SQLite adapter (production) — reads/writes the 5
                                           #   ADR-028 §2 tables via src/infra/db/schema.ts
  migration.ts                            # NEW: one-time migrateLegacyPresentationSettings() (REQ-08) —
                                           #   see Migration Safety
  __specs__/                              # spec-linked test fixtures, mirrors presentation/identity
  __tests__/                              # unit + integration tests

src/infra/db/schema.ts                    # MODIFIED: add 5 Drizzle table defs (ADR-028 §2 DDL) —
                                           #   settingDefinitions, settingValuesGlobal,
                                           #   settingValuesWorkspace, settingValuesUser,
                                           #   settingRevisions

src/identity/permissions.ts               # MODIFIED: BASE_CATALOG gains the settings.* strings (REQ-06);
                                           #   settings.write is marked deprecated per ADR-028 §7
                                           #   (removed only after the migration clause there completes —
                                           #   out of this feature's scope, tracked as a follow-up)
src/identity/seed.ts                      # MODIFIED: migration granting settings.definitions.manage to
                                           #   existing settings.write holders (ADR-028 §7 migration clause)

src/server/routes/admin/settings/         # NEW route module, mirrors routes/admin/menus/ shape
  register-definitions.ts                 # registerAdminSettingsRegisterDefinitionsRoute (REQ-10)
  get-effective.ts                        # registerAdminSettingsGetEffectiveRoute
  set.ts                                  # registerAdminSettingsSetRoute
  clear.ts                                # registerAdminSettingsClearRoute
  reset.ts                                # registerAdminSettingsResetRoute
src/server/app.ts                         # MODIFIED: import + wire the 5 route registrars (matches the
                                           #   existing import/register block for menus/members/etc.)
src/server/seed.ts                        # MODIFIED: invoke migrateLegacyPresentationSettings() in the
                                           #   existing seed boot path (REQ-08)

src/core/commands/appliers.ts             # MODIFIED: PresentationSettingsRepoPort read replaced with
                                           #   getEffective('core.presentation.activeThemeId', …)
src/navigation/ports.ts                   # MODIFIED: same re-point as above

apps/admin/src/sections/Settings.tsx      # NEW: single flat file (matches Members.tsx/Menus.tsx
                                           #   convention), internally composed of the 8 ui.spec.md
                                           #   components (SettingsContainer, PrincipalSelector,
                                           #   NamespaceGroupList, SettingRow, SettingDetailPanel,
                                           #   ValueEditor, ResetNamespaceDialog, EmptyState, ErrorBanner)
apps/admin/src/App.tsx                    # MODIFIED: import + mount <Settings /> (matches the existing
                                           #   per-section import/route block)
```

**Out of this feature's scope (explicitly deferred, not silently dropped):** deleting `src/features/presentation/*` and the `presentation_settings` table (see Migration Safety's Point of No Return); the `settings.write` permission removal from `BASE_CATALOG` (ADR-028 §7's own migration clause, gated on verifying the seed-time grant migration).

## API / Event Contract Summary

What interfaces does this decision define that other agents must respect?

- `SettingsRepoPort` (`src/features/settings/ports.ts`) — interface, two adapters (`repo.memory.ts`, `repo.sqlite.ts`); TDD/Programmer must not add a third write path.
- `SettingsWriteService.set/clear/registerDefinitions/reset` (`write-service.ts`) — the only exported mutation surface; `Programmer` must keep repo write methods package-private (not exported from `index.ts`), enforcing REQ-04's "no side door" at the module boundary.
- Admin HTTP endpoints per `api.spec.md` §1: `SETTINGS_GET_EFFECTIVE`, `SETTINGS_GET_RAW`, `SETTINGS_LIST_DEFINITIONS`, `SETTINGS_REGISTER_DEFINITIONS`, `SETTINGS_SET`, `SETTINGS_CLEAR`, `SETTINGS_RESET` — each gated by the matching `settings.*` permission through `authorize()`.
- `PRINCIPAL_NOT_FOUND` error code (errors.spec.md, added in the Red-Team fix pass) — new 404 response on `SETTINGS_SET`/`SETTINGS_CLEAR`; Programmer must map `PrincipalNotFoundError` to this code at the route layer, matching the existing error-mapping pattern for `DEFINITION_NOT_FOUND`.
- Every `setting_revisions` row (append-only ledger) is a durable event other future features (e.g., a deferred audit-view screen per OQ-01) can read without a schema change — `entity_kind`, `op`, `actor`, `seq` are the stable event shape.

## Enforcement

How do we prevent violations?
- Code Review Agent flags any import of `settings`' repo adapter (`repo.memory.ts`/`repo.sqlite.ts`) from outside `write-service.ts` — the chokepoint boundary is a review-time architecture check, mirroring ADR-022's existing CI-canary pattern for `entries`.
- Code Review Agent flags any new port added under `src/features/settings/` beyond `SettingsRepoPort` without a documented rule-of-two justification (Article IV).
- Code Review Agent verifies `deriveRequiredPermission()` has direct unit test coverage for both AC-25 (negative) and AC-26 (positive) before approving the chokepoint PR.
- Code Review Agent verifies all three named `PresentationSettingsRepoPort` consumers (`appliers.ts`, `seed.ts`, `navigation/ports.ts`) are re-pointed in the same PR that lands the migration — no partial cutover.

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| — | — | — | — |

## Related Decisions

- Extends: ADR-028 (Settings — Layered Settings Ledger, ACCEPTED 2026-07-11) — this ADR implements its core-only subset; ADR-022 (write chokepoint/revision discipline); ADR-021 (`authorize()`, `PrincipalRepoPort`); ADR-015 (Drizzle); ADR-007 (workspace scoping, and the structural-scoping fact used to precisely define REQ-13's principal check); ADR-006 (rule-of-two)
- Relates to: ADR-020 (theme presets → `theme.{themeId}` settings), SPEC-006 (identity-and-authorization — the permission catalog and `PrincipalRepoPort` this ADR builds on)
