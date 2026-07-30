# ADR-PIPE-012: Menus Remediation — Permission Catalog Rename/Split, SQLite Persistence, Outbox Events, Binding-Index Reconciliation

- Status: ACCEPTED 2026-07-13 (human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; `/audit-work` has NOT run — accepted with that acknowledged gap given the shared permission-migration mechanism (`src/identity/permission-migrations.ts`) is security-adjacent and reused by up to 3 sibling remediations; strongly recommend `/audit-work` before this mechanism is wired into live seed boot, not before ACCEPTED. Article II exception (no matching spec revision) also carried forward, unresolved — accepted as a named, tracked gap, not silently closed)
- Date: 2026-07-13
- Spec: SPEC-012 v1.0.0 (hash: sha256:f1d9a8aa4c8434a7b7dbafd78f696c04f75edcc06bde4250f8aae91a55b4bf9d) — **as-built backfill spec**, see Constitution Check Article II for why this ADR proposes new implementation without a matching spec revision yet
- Author: Software Architect Agent

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Persistence uses Drizzle/SQLite (ADR-015), already the project standard — no new library. The permission-rename mechanism is small domain logic (a deprecation/fan-out table), not a solved external problem; no maintained "permission migration" library exists that fits a code-side flat-string RBAC catalog this shape. |
| II — Test-First | **EXCEPTION** | SPEC-012 is an as-built backfill of already-shipped code — it documents REQ-01..16 as they exist today, and none of them describe the remediation work this ADR proposes (permission split/rename, SQLite adapters, outbox events, binding-index reconciliation). This ADR is being produced directly from a Coordinator remediation directive, without a preceding SPEC-012 v1.1 (or dedicated remediation spec) carrying new REQ/AC/INV rows for this work. That inverts Article II's normal order (spec's tests before implementation) by construction of this dispatch, not by a process failure — mirroring the same honesty SPEC-012 itself uses for its own Article II exception. **Remediation plan:** before the TDD Agent certifies any test against this ADR, the Coordinator must either (a) route to the Spec Agent for a SPEC-012 v1.1 amendment adding REQ-17..20 (see this ADR's Contract Map, which is written at spec-equivalent granularity so that amendment is largely a transcription), or (b) explicitly accept this ADR's Contract Map + Critical Invariants as the REQ-equivalent surface for this pass and record that waiver in `pipeline-state.md`. This ADR does not silently treat itself as spec-approved. |
| III — Simplicity Gate | COMPLIES | Every new module below closes a named, already-disclosed Deviation (D-1/D-2/D-5/D-8/D-9/D-11 in `spec-manifest.md`) — no speculative generality. The permission-migration mechanism is scoped to exactly what four sibling remediation ADRs (Menus, Members, Analytics, Integrations) independently need (a deprecate-old/grant-new fan-out), not a general-purpose migration framework. |
| IV — Anti-Abstraction Gate | COMPLIES | `MenuRepoPort` and `NavLocationBindingRepoPort` both go from one adapter to the rule-of-two-complete two adapters (in-memory + SQLite) this ADR adds — closing the exact single-adapter exception ADR-029 §5 previously carried under Article IV. No new port is introduced beyond that; the permission-migration mechanism and the outbox-enqueue calls are plain functions, not ports (nothing here needs a second implementation). |
| V — Integration-First Testing | COMPLIES | The SQLite adapters are contract-tested against the same suite the in-memory adapters already pass (mirrors `PostRepoPort`/`SettingsRepoPort` precedent); the permission split is verified at the real HTTP route layer (`admin-menus-routes.test.ts`-style, per action); the migration function is verified with a real `PolicyPermissionRepoPort` fixture, not mocked. |
| VI — Security-by-Default | COMPLIES | This remediation directly narrows a real Article VI gap already named in SPEC-012 (D-1: force-purge sharing a permission with ordinary edits). No route becomes *less* protected; every route keeps `authorize()` gating, now checking the action-appropriate string. The standing Art. VI local-dev-only exception is unchanged. |
| VII — Spec Integrity | COMPLIES (conditionally — see Article II) | This ADR cites SPEC-012 v1.0.0 at its current hash. If the Coordinator elects remediation path (a) above (a SPEC-012 v1.1 amendment), that revision's new hash supersedes this citation before TDD begins; if path (b), `pipeline-state.md` records the explicit waiver so the hash reference stays honest. |
| VIII — Observability | **EXCEPTION** | This ADR adds outbox event publishing (closing D-11), which is a net observability *improvement* — but it does not add a `correlationId`/`occurredAt` field to the Menus HTTP error envelope (SPEC-012's own pre-existing Article VIII exception for error responses is unchanged and out of this remediation's scope). Also: `authorize()`'s decision `reason` is not currently logged anywhere, which this ADR's Migration Safety section notes is needed before the legacy `navigation.manage` string can be safely deleted (see Migration Safety, Point of No Return) — named as a small forward deferral, not fixed in this pass. |

Any EXCEPTION must have a row in the Complexity Justification table below.

## Research Summary

- Research artifact: N/A — no library, framework, or persistence-mechanism choice is open. Persistence is Drizzle/SQLite per ADR-015 (already decided, already used by `posts`/`settings`/`presentation`/`workspace`); the outbox is ADR-009's existing `OutboxPort`/`processOutbox` (already decided, already used by the command gateway and `features/workspace/create.ts`). The one genuinely open design question — how a code-side flat-permission-string RBAC catalog survives a breaking rename across four sibling remediation ADRs — is resolved in Pattern Evaluation below by generalizing a pattern that already exists ad hoc in this codebase (`settings.write` → `settings.definitions.manage`, `identity/seed.ts` lines 42-54), not by inventing a new mechanism from scratch.
- Key decision: Extract the already-shipped-but-informal "deprecate old permission, grant holders the new one(s) at seed/boot time" pattern into a small reusable module (`src/identity/permission-migrations.ts`) instead of hand-rolling a fourth ad hoc copy of it for Menus.

## Planning Preflight Evidence

- Coordinator Planning Preflight: Not re-run for this remediation pass — SPEC-012's own Planning Preflight (`--phase preflight`) was run by the Spec Agent for a sanity check only (see `pipeline-state.md`: `planning_preflight_status`), and the Coordinator sign-off row in `spec-dod.md` is filled with an explicit as-built acceptance note, not a forward-implementation approval. Per this Article II exception, a real Planning Preflight for *this remediation's* own implementation readiness is owed once the Article II remediation plan resolves (SPEC-012 v1.1 or documented waiver).
- Spec hash verified at: 2026-07-13 (validator `--phase spec --update-hash`, per `pipeline-state.md`) — unchanged since this ADR does not modify SPEC-012's content.
- Red-Team status and artifact: NOT STARTED (`pipeline-state.md`) — this remediation has not been red-teamed. Recommended before ACCEPTED, given the permission-rename mechanism is security-relevant (a bug there is a fail-open or fail-closed-lockout risk across four features at once).
- System Blueprint status and artifact: Not produced — no macro-topology change; this is in-place remediation inside the existing `src/navigation` feature module and a new shared `src/identity/permission-migrations.ts` helper, both inside the current modular monolith.
- CodeBase Analyzer reports consumed: None formal; this ADR performed direct source inspection of `src/navigation/*.ts`, `src/server/routes/admin/menus/*.ts`, `src/server/http/admin/menus.ts`, `apps/admin/src/sections/{Menus,MenuEditor}.tsx`, `src/identity/{permissions.ts,authorize.ts,seed.ts,types.ts}`, `src/features/post/repo.sqlite.ts`, `src/features/settings/{migration.ts,repo.sqlite.ts}` (as the closest existing precedent), `src/infra/db/schema.ts`, `src/server/{app.ts,deps.ts,routes/types.ts}`, `src/core/events/outbox-worker.ts`, `src/core/ports.ts`, `src/core/commands/command.ts` to ground every module boundary below in real repo precedent.
- Reverse-spec artifacts consumed: None formal — SPEC-012 itself is the as-built grounding document for the *current* shipped behavior; this ADR is new forward remediation work layered on top of it, not a reverse-spec extraction.
- Validator result or waiver: N/A — this ADR does not touch the Speckit spec package; SPEC-012's own validator run is unaffected.

## Context

FEAT-012 (Menus) shipped directly from ADR-029 during the 2026-07-10 autonomous sweep without its own SPEC-NNN package. SPEC-012 (this feature's as-built backfill spec, written 2026-07-13) subsequently disclosed **eleven** real code-vs-ADR-029 deviations (D-1 through D-11, `spec-manifest.md`) rather than silently resolving them in either direction. This ADR is a **remediation** pass: given that disclosure, decide which gaps are worth closing now, in what order, and with what concrete architecture — it is not a from-scratch design (ADR-029 remains the governing design decision; this ADR only implements closing a subset of the drift between that design and the running code).

The relevant system drivers:
- **Cross-cutting blast radius.** D-1/D-2/D-9 (the permission-naming gap) is not Menus-specific — `src/identity/permissions.ts`'s own doc comment (lines 136-148) shows `integration.manage` (ADR-036/Integrations) carries the *identical* gap, registered the same day, with the same rationale for why the `admin.<section>.<action>` convention "has no implementation behind it anywhere in this codebase" at the time both shipped. `sweep-crosscutting-decisions-20260710.md` §E froze that convention **specifically because** a permission-string rename after real grants exist is a breaking migration. Four sibling remediation agents (Menus, Members, Analytics, Integrations) are being dispatched in parallel today against this same class of gap. Solving it once, generally, is a materially different (and cheaper) commitment than four independent one-off renames.
- **Real production gaps vs. named-and-scoped-elsewhere gaps.** D-5 (no SQLite adapter — menu data does not survive a process restart) and D-11 (no outbox events — nothing downstream can react to a menu change) are genuine gaps for anyone running this server today, with no other in-flight work already scoped to close them. By contrast, D-4 (`termRef` link integrity) was already promoted from an ADR-029 Open item to a named **Wave-1 acceptance blocker** in ADR-029's own Round-3 audit fold (`ADR-029-menus-navigation.md`, "Round-3 audit fold" section) and is gated on a **content-lib** decision (a `term_refs` schema or an `entry_refs` extension) this ADR has no authority to make unilaterally — re-litigating it here would duplicate work already assigned elsewhere and could produce a conflicting answer.
- **What happens if we do nothing:** the permission-naming drift compounds every time another sibling feature ships its own one-off `<domain>.manage` string (as it did twice already, Menus and Integrations, on the same day); Menus data loss on every server restart continues; and no consumer (search reindex, cache invalidation, AI memory) can ever react to a menu change without polling.

## Decision

Close five of the eleven disclosed deviations in this pass — the permission catalog split + namespace rename (D-1/D-2/D-9), SQLite persistence for both navigation repo ports (D-5), outbox event publication from the four mutating `menu-service.ts` functions (D-11), and wiring a caller for the already-implemented-but-unused binding-index rebuild (D-8) — and explicitly defer the remaining six (D-3, D-4, D-6, D-7, D-10, plus the general command-gateway migration) with named reasons, rather than attempting all eleven in one pass or silently picking a subset without justification.

The permission-rename piece is implemented as a **new, small, reusable mechanism** (`src/identity/permission-migrations.ts`) generalized from the pattern already shipped ad hoc for `settings.write` → `settings.definitions.manage` (ADR-028 §7, `identity/seed.ts`), not a Menus-only rename — so the three sibling remediation ADRs (Members, Analytics, Integrations) can call the same `registerPermissionMigration()` function for their own `<domain>.manage` → `admin.<section>.<action>` rename without re-deriving this design.

**Pattern(s) selected:** Hexagonal ports-and-adapters rule-of-two completion (in-memory + SQLite, inherited unchanged from ADR-006/ADR-029 §5) for the two navigation repo ports; a deprecate-and-fan-out permission migration table (new, generalized from existing in-repo precedent) for the permission rename; direct `OutboxPort.enqueue()` calls from the existing mutating functions (inherited unchanged from ADR-009, already used elsewhere) for event publication.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS
- Notes: Every change stays inside the existing `src/navigation/` vertical slice, the existing `src/identity/` module, or the existing SQLite composition root (`src/server/deps.ts`) — no new top-level module, no new service boundary. The one new file (`src/identity/permission-migrations.ts`) is a small, single-purpose extraction of logic that already exists informally in `identity/seed.ts`; it is not new ceremony, it is de-duplication of a pattern about to be hand-copied a fourth time.

## Rationale

Map the decision to the system drivers:
- **Driver: cross-cutting permission-rename blast radius** → addressed by extracting `registerPermissionMigration()`/`migrateDeprecatedPermissionGrants()` as a shared mechanism before Menus' own rename is implemented, so Members/Analytics/Integrations reuse it rather than each inventing an incompatible one-off (which would itself become a second, worse cross-cutting inconsistency).
- **Driver: real data-loss and observability gaps (D-5, D-11) with no other owner** → addressed directly: SQLite adapters (mirroring `SqlitePostRepo`'s already-proven shape) and outbox `enqueue()` calls (mirroring `features/workspace/create.ts`'s already-proven call shape) — both are applications of already-decided, already-used patterns, not new architecture.
- **Driver: don't re-litigate a decision already assigned elsewhere (D-4)** → addressed by explicitly deferring `termRef` integrity to the content-lib `term_refs` schema decision named in `sweep-crosscutting-decisions-20260710.md` §C-029, cross-referenced rather than re-solved.
- **Driver: minimize the number of breaking grant-migration events** → addressed by doing the permission **split** (D-1) in the same pass as the **rename** (D-2/D-9), since `src/navigation/contracts.ts` already declares the intended 7-entry `NAVIGATION_PERMISSIONS` catalog (just never registered) — deferring the split to a later pass would mean triggering the fan-out migration mechanism twice for the same feature instead of once.

## Pattern Evaluation

The persistence pattern (hexagonal ports-and-adapters, rule-of-two) and the event-publication pattern (outbox `enqueue()`) are **inherited unchanged** from ADR-006/ADR-009/ADR-029 §5 and are not re-evaluated here. The one genuinely open design choice this ADR makes is **how the permission rename/split is implemented and kept reusable across four sibling remediation ADRs**:

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Shared deprecate-and-fan-out migration table (`registerPermissionMigration`/`migrateDeprecatedPermissionGrants`), generalized from the existing `settings.write` precedent | Strong fit | High | measured (the exact shape already exists and already works in `identity/seed.ts` lines 42-54; this only extracts it into a named, reusable, tested function) | Zero new abstraction class — formalizes a pattern already proven in this codebase; the deprecated string is never deleted from the catalog (only marked), so nothing that already resolves `navigation.manage` silently breaks mid-migration; one function four sibling ADRs can call with their own `{from, to}` pair; naturally idempotent (safe on every boot, matching `migrateLegacyPresentationSettings`'s precedent) | Requires every remediation ADR to route its rename through this one module — a coordination cost, not a technical one | Centralizing the mechanism means a bug in it affects up to four features at once — mitigated by dedicated unit tests for the fan-out function itself, independent of any one feature's grants | **SELECTED** |
| Hard rename, no migration path (just change the string everywhere, no back-compat) | Weak fit | Low | analogical | Simplest possible code change | Silently breaks any already-issued grant carrying the old string the instant this ships — exactly the risk `sweep-crosscutting-decisions-20260710.md` §E named as the reason the convention was frozen *before* any Wave-1 ADR shipped; currently low-probability (identity has no persisted grants yet) but becomes a real, silent lockout the moment the identity SQLite adapter lands, with no warning | None that justify the risk given the convention doc explicitly anticipated this exact failure mode | Not selected — trades a small amount of code for a real, if currently latent, security/availability defect class |
| Runtime dual-check inside `authorize()` itself (check both old and new string names at evaluation time, no migration write) | Weak fit | Medium | analogical | No migration step to run or test | Permanently complicates the one evaluator every feature depends on (`authorize()`, ADR-021 §2/§6 "one evaluator") with feature-specific alias knowledge it should never need; the aliasing would live forever (no natural retirement point) unless a separate mechanism removes it later anyway — so this doesn't avoid building the migration, it just adds a second, permanent layer on top of it | `authorize()` gains permanent, unbounded-growth special-case logic as more features rename permissions over time | Not selected — violates the single-evaluator simplicity ADR-021 §2 already committed to, and does not actually eliminate the need for a real migration function |

## Quality Attribute Scorecard

Most axes are governed by already-decided, already-proven patterns (ADR-006/009/015/029 §5) and are not re-scored. Scored here for the concrete new surface this ADR adds: the permission-migration mechanism, the two SQLite adapters, and the outbox wiring.

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of adding a fifth sibling ADR's permission rename later | 5 | measured | `registerPermissionMigration()` is a one-call registration; no route-layer code needs to know about the mechanism beyond checking its own new string | None new | Members/Analytics/Integrations each add one call + update their own route checks; no shared-file merge conflict beyond one new registration line each | Each sibling ADR's rename is independent once registered | always-on | — | — | +2 vs the hard-rename alternative, which offers no reuse surface at all |
| modularity | Cross-module coupling | 4 | measured | `permission-migrations.ts` lives in `identity` (already the module every feature depends on for `authorize()`); `navigation` gains a read/write dependency on `OutboxPort` it already has access to via `RouteDeps.outbox` (no new wiring) | `navigation`'s SQLite adapters add a compile-time dependency on `src/infra/db/schema.ts`, same as every other feature's SQLite adapter — an existing, accepted coupling shape, not a new one | Matches the exact dependency shape `posts`/`settings`/`presentation` already have | — | always-on | — | — | — |
| scalability | Read/write volume headroom | 4 | prior_art | SQLite adapters follow `SqlitePostRepo`'s proven per-workspace-indexed-scan shape; binding-index reconciliation runs once at boot, O(menus in workspace) | None new for the scale this app targets (single-site, non-expert-operator install per ADR-011/012) | No new scaling concern introduced | — | always-on | — | — | — |
| reliability | Never-brick / correctness under failure | 4 | measured | The permission migration never deletes the old string (additive-only), so a failed/partial migration run leaves the system in its previous, still-functioning state, not a locked-out one; SQLite adapters mirror an already-battle-tested shape | Outbox `enqueue()` calls inside `menu-service.ts`'s already-non-transactional multi-write functions (D-6) add one more write that can partially fail alongside the existing accepted gap — documented, not newly introduced, but worth naming | This ADR does not fix D-6; it adds one more sequential write to a function that already has that accepted limitation | The existing D-6 gap is accepted tech debt, unchanged by this ADR | always-on | Owner: whoever eventually builds the ADR-008 gateway's transaction machinery for menus (D-3/D-6); until then, an outbox-enqueue failure after a successful repo write is a partial-failure mode identical in shape to the existing binding-index-write partial-failure mode already accepted in `assignLocation`'s doc comment | Trigger: real cross-write transactions landing for navigation (see Re-evaluation Triggers) | — |
| security | Authorization correctness | 3 | measured | The permission split directly closes a real gap (force-purge no longer shares a permission with ordinary edits) — a genuine security improvement | The migration mechanism is new, security-adjacent code (grant fan-out) that, if buggy, could either fail-open (grant more than intended) or fail-closed (lock out an existing role) across up to four features at once | Both failure directions are plausible from a bug in one shared function — this is exactly why Red-Team review is recommended before ACCEPTED (see Planning Preflight Evidence) and why the migration function gets dedicated unit tests independent of any one feature | The fan-out is additive-only (never removes the old grant), which bounds the fail-closed risk to "a required new permission is missing," not "a role loses all access" | always-on | Owner: TDD Agent — certify `migrateDeprecatedPermissionGrants()` with a dedicated fixture-driven test (old grant → all `to` strings present, old grant still present, no other policy's rows touched) before Programmer wires it into any route's live authorization path | Trigger: before this ADR moves ACCEPTED | -1 vs a hypothetical dedicated per-feature migration (more code, but a bug in one feature's migration wouldn't be a shared-code bug affecting three others) — accepted because the shared mechanism's small size makes it easier to review and test thoroughly than four divergent copies |
| operability | Ops/debugging surface | 3 | measured | Outbox events give downstream consumers (cache invalidation, search reindex) a signal that didn't exist before; SQLite persistence means menu state survives a restart, closing a real operability gap | `authorize()`'s decision reason (which permission string actually matched) is still not logged anywhere — named in the Constitution Check's Article VIII exception as a gap worth closing before the old permission string can be safely deleted | This ADR improves operability but does not close every operability gap in scope | — | always-on | Owner: a follow-up (not this ADR) to add a debug-level log of the matched permission string in `authorize()`, needed before Point of No Return (see Migration Safety) | Trigger: before deleting `navigation.manage` from the catalog | — |
| cost | Build/run cost | 5 | measured | No new infrastructure; same SQLite file, same server process, same outbox worker already polling | None | Pure incremental addition to existing infrastructure | — | always-on | — | — | — |
| testability | Ease of certifying behavior | 4 | measured | SQLite adapters get the existing contract-test-suite treatment for free (same suite the in-memory adapter already passes); the migration function is a pure-ish function over a repo port, directly unit-testable | The route-level permission-split change touches all six route files' tests (`admin-menus-routes.test.ts`) — a wider single-PR test-diff surface than most remediation slices, though each change is mechanical | — | — | always-on | — | — | — |

No axis scored ≤2; the security axis (3) and operability axis (3) both carry named, owned mitigations above rather than being silently accepted.

## Overall Strengths

- The permission-migration mechanism is genuinely reusable — it is written once, here, for Menus, but sized and shaped so Members/Analytics/Integrations can adopt it with a one-line registration each rather than reinventing it.
- Every piece of new surface (SQLite adapters, outbox calls) is an application of an already-decided, already-proven pattern elsewhere in this codebase — no new architectural risk class is introduced.
- The deferred items (D-3/D-4/D-6/D-7/D-10) are deferred with named reasons and named owners/triggers, not silently dropped — consistent with SPEC-012's own disclosure discipline.

## Overall Weaknesses

- This ADR proposes real implementation without a matching spec revision (Article II exception) — a genuine process gap this ADR is explicit about rather than papering over.
- The permission split touches all six route files and the full built-in role seed data in one PR — a wider single-change surface than the other three remediation items, even though each individual edit is mechanical and low-risk.
- The security axis (3/5) reflects real, if bounded and mitigated, risk in a shared mechanism now used across up to four features.

## Tradeoff Tension

We are trading a wider single-PR blast radius for the permission split (touching all six route files + seed data at once, instead of doing the rename now and the split later) in exchange for triggering the breaking grant-migration mechanism exactly once for this feature instead of twice.

## Why This Won

Doing the split and the rename together costs one extra day of route-file edits now, in exchange for never having to run the fan-out migration a second time against Menus' own grants later — and `contracts.ts` already declares the target 7-entry catalog, so the "design" half of the split was already paid for by ADR-029 and simply never wired up. Building the permission-migration mechanism as a shared module (rather than a Menus-local rename) costs slightly more thought now in exchange for Members/Analytics/Integrations not each inventing a fourth incompatible variant of the same fix — which would itself become a new cross-cutting inconsistency the next sweep would have to clean up.

## Runner-Up Comparison

- Runner-up: Do the rename only (`navigation.manage` → `admin.menus.manage`, single flat permission), leave the 7-entry split as a separately-scoped future pass.
- Why it lost: It still requires touching every route file and the seed data once; deferring the split to "later" would mean touching them a second time for the same feature, and the split was already fully designed in `contracts.ts` — there was no real complexity being deferred, only a second migration event being invited for no benefit.

## Consequences

**Positive:**
- Force-purge (`admin.menus.delete.force`) is finally gated separately from ordinary menu edits, closing a real, already-named Article VI-adjacent gap (D-1).
- Menu data survives a server restart for the first time (D-5).
- Downstream consumers (future cache invalidation, search reindex, AI memory) gain a real signal to react to (D-11).
- The binding index can no longer silently drift without a rebuild path being exercised (D-8).
- Three sibling remediation ADRs inherit a tested, reusable rename mechanism instead of independently inventing one.

**Negative / Tradeoffs:**
- All six route files and the built-in role seed data change in the same PR — reviewers should expect a wider diff than a typical single-deviation fix.
- The permission-migration mechanism is new, shared, security-adjacent code that (per the security axis above) carries real if bounded and mitigated risk.
- This ADR's own Article II exception means a spec-amendment or explicit waiver decision is still owed before implementation proceeds — this ADR does not itself clear that gate.

**Risks:**
- Risk: A bug in `migrateDeprecatedPermissionGrants()` silently drops a role's effective menu access → plan: TDD certifies the migration function against a fixture asserting the old grant is never removed and every `to` string is added, before Programmer wires it into the live seed boot path (Quality Attribute Scorecard, security axis).
- Risk: The outbox-enqueue call inside `menu-service.ts`'s non-transactional mutating functions fails after the repo write already succeeded, leaving a menu change with no corresponding event → plan: documented as the same class of accepted gap as D-6's existing binding-index-write risk, owned by the eventual command-gateway transaction work (Quality Attribute Scorecard, reliability axis).
- Risk: This ADR proceeds to TDD/Programmer without the Article II gap being resolved → plan: Coordinator must explicitly choose remediation path (a) or (b) in the Constitution Check before dispatch continues (see Recommended Next Command in the handoff).

## Mitigations Required

- Weak axis: security (3/5).
  Mitigation: dedicated fixture-driven unit test for `migrateDeprecatedPermissionGrants()` proving additive-only behavior (old grant retained, all `to` strings added, no cross-policy leakage), certified by TDD before Programmer wires it into `identity/seed.ts`'s live boot path.
  Owner: TDD Agent.
  Enforcement: Code Review Agent verifies this test exists and passes before approving the PR that wires the migration call into `seedIdentity()`.
  Deadline or trigger: before this ADR moves ACCEPTED.

- Weak axis: operability (3/5).
  Mitigation: log the matched permission string at debug level inside `authorize()`'s `matched`/`owner_wildcard` return paths.
  Owner: follow-up task (not required to land in this remediation's own PR).
  Enforcement: named as a Point-of-No-Return precondition in Migration Safety below.
  Deadline or trigger: before `navigation.manage` (or any sibling ADR's equivalent legacy string) is deleted from the catalog.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | **Expand:** register the 7 new `admin.menus.{read,create,update,delete,delete.force,assign,manage}` strings in `src/identity/permissions.ts` (owner: `navigation`) **alongside** the existing `navigation.manage` entry, which is **kept registered and marked deprecated** (not deleted) — the identical shape `settings.write` already uses (`permissions.ts` lines 42-47). `src/navigation/contracts.ts`'s `NAVIGATION_PERMISSIONS` constant is updated to the new 7-entry catalog (it already declared this shape; only the string values change). **Contract:** all six route files switch their `authorize()` check from `navigation.manage` to the action-specific new string in the same PR (no partial cutover — see Enforcement). |
| Dual-write or read-routing plan | No dual-write window in the ordinary sense (there is no persisted `policy_permissions` data to keep in sync across two writers) — but the **fan-out** itself is the analogous concern: `migrateDeprecatedPermissionGrants()` (`src/identity/permission-migrations.ts`, NEW) is an idempotent, additive-only pass that, for every registered `{from, to}` pair, ensures every policy holding `from` also holds every string in `to` — never removing `from`. Called once from `identity/seed.ts`'s existing boot path, immediately after built-in roles/policies are seeded (mirrors `migrateLegacyPresentationSettings()`'s call-site pattern in ADR-PIPE-007). |
| Backfill plan | `identity/seed.ts`'s `BUILTIN_ADMIN_PERMISSIONS` list is edited to grant the new six `admin.menus.*` CRUD strings directly (dropping the now-legacy `navigation.manage` entry from the *seed* list, though the string itself stays registered in the catalog) — so every freshly-seeded workspace gets the correct grants without depending on the migration pass at all. The migration function exists primarily for the future case (once the identity SQLite adapter ships) where a persisted workspace's grants predate this ADR; it is exercised and tested now against the in-memory repo so it is proven correct before that adapter lands, not written blind. |
| Reconciliation checks | An integration test asserts: for a policy holding only `navigation.manage` before migration, `authorize()` succeeds for all six menu routes' action-specific permission after migration — i.e., no role is silently narrowed by the split. A second test asserts `migrateDeprecatedPermissionGrants()` is a no-op on a second call (idempotency) and never touches a policy that never held `navigation.manage`. |
| Observability proving phase health | Each grant added by the migration is an ordinary `policy_permissions.save()` call — visible via the existing `PolicyPermissionRepoPort.listByPolicyId` read path used by tests/inspection today. No new migration-specific telemetry is added in this pass (see the Article VIII / operability-axis mitigation above for the one named follow-up: logging which permission string an `authorize()` call actually matched). |
| Rollback test | Because `navigation.manage` is never deleted from the catalog and the migration only **adds** rows (never removes), rollback before the Point of No Return is simply: revert the six route files' `authorize()` checks back to `navigation.manage`. No data-destructive step happens before that point. |
| Cutover approval and timing | Cutover = the six route files' `authorize()` checks switching to the new action-specific strings, landing in the same PR as the catalog change and the seed-data update (small, already-enumerated, exhaustive consumer set — mirrors ADR-PIPE-007's reasoning for its own single-PR cutover). No separate approval gate beyond normal Code Review, **conditional on** the Article II remediation plan above being resolved first. |
| Point of no return | Deleting the `navigation.manage` catalog entry (and the now-dead `integration.manage`-style precedent it sets) is **explicitly deferred**, not part of this remediation's task list — gated on (a) the identity SQLite adapter shipping and a real deprecation window passing with observed zero reliance on the old string, which requires (b) the authorize()-decision logging named in the operability mitigation above existing first to actually measure that. Scheduling this follow-up is the Coordinator's job, mirroring ADR-PIPE-007's identical deferral of its own legacy-port deletion. |
| Post-cutover verification | The Reconciliation Checks above, plus a manual pass confirming each of the six admin Menus UI actions (list, open, create, save, assign location, trash, force-purge) still succeeds end-to-end for the seeded owner/admin principals after the migration runs at boot. |

## Re-evaluation Triggers

- Calendar trigger: None forced — but the Point of No Return (deleting `navigation.manage`) should be revisited once the identity SQLite adapter ships (see Dependency trigger below), since that is the point this migration mechanism stops being theoretical.
- Scale trigger: None — permission catalogs and per-workspace binding-index rows are both small, bounded collections by construction (registered locations, registered permissions), not user-scale data.
- Topology trigger: If the ADR-008 command gateway gains menu support (closing D-3), re-evaluate whether the outbox-enqueue calls added by this ADR should move from `menu-service.ts` into the gateway's own event-emission step instead (avoiding a double-emission risk) — see the Dependency trigger below.
- Dependency trigger: (a) If `identity` gains a SQLite adapter for `policy_permissions`, re-run this ADR's Reconciliation Checks against real persisted data before relying on the migration mechanism in production, and revisit the Point of No Return. (b) If the ADR-008 command gateway's revert registry gains menu support (unblocking D-3), re-evaluate whether this ADR's direct `outbox.enqueue()` calls in `menu-service.ts` should be removed in favor of the gateway's own event emission, to avoid two emission paths existing at once.

## Module / Service Boundaries

```
src/identity/permission-migrations.ts     # NEW: PermissionMigration type + registerPermissionMigration()
                                           #   + listPermissionMigrations() + migrateDeprecatedPermissionGrants()
                                           #   (deprecate-old/grant-new fan-out, generalized from the existing
                                           #   settings.write -> settings.definitions.manage precedent).
                                           #   Reusable by Members/Analytics/Integrations remediation ADRs.
src/identity/permissions.ts               # MODIFIED: replace the single `navigation.manage` registration with
                                           #   the 7-entry admin.menus.* catalog (owner: "navigation"); keep
                                           #   `navigation.manage` registered + marked deprecated; register the
                                           #   {from: "navigation.manage", to: [6 CRUD strings]} migration.
src/identity/seed.ts                      # MODIFIED: BUILTIN_ADMIN_PERMISSIONS grants the 6 new admin.menus.*
                                           #   CRUD strings directly; seedIdentity() calls
                                           #   migrateDeprecatedPermissionGrants() once, mirroring
                                           #   migrateLegacyPresentationSettings()'s call-site pattern.

src/navigation/contracts.ts               # MODIFIED: NAVIGATION_PERMISSIONS becomes the admin.menus.* 7-entry
                                           #   catalog (values only; the const array shape is unchanged).
src/navigation/menu-service.ts            # MODIFIED: createMenu/updateMenuTree/assignLocation/deleteMenu each
                                           #   gain an `outbox: OutboxPort` (+ `idGen: IdGeneratorPort` where
                                           #   not already present) dependency and enqueue the matching
                                           #   NAVIGATION_EVENTS entry after each successful repo write (D-11).
src/navigation/repo.sqlite.ts             # NEW: SqliteMenuRepo (implements MenuRepoPort, mirrors
                                           #   SqlitePostRepo) + SqliteNavLocationBindingRepo (implements
                                           #   NavLocationBindingRepoPort, composite-unique-key upsert) (D-5).
src/navigation/reconcile.ts               # NEW: rebuildNavLocationBindings() — the first real caller of the
                                           #   already-implemented-but-unused NavLocationBindingRepoPort
                                           #   .rebuildForWorkspace (D-8); called once at boot.

src/infra/db/schema.ts                    # MODIFIED: add `menus` + `nav_location_bindings` Drizzle table defs
                                           #   (mirrors the `posts` table shape + a composite-unique index).

src/server/routes/admin/menus/list.ts             # MODIFIED: authorize() checks admin.menus.read
src/server/routes/admin/menus/get-by-id.ts        # MODIFIED: authorize() checks admin.menus.read
src/server/routes/admin/menus/create.ts           # MODIFIED: authorize() checks admin.menus.create;
                                                   #   outbox passed through to createMenu
src/server/routes/admin/menus/update-tree.ts      # MODIFIED: authorize() checks admin.menus.update;
                                                   #   outbox passed through to updateMenuTree
src/server/routes/admin/menus/assign-location.ts  # MODIFIED: authorize() checks admin.menus.assign;
                                                   #   outbox passed through to assignLocation
src/server/routes/admin/menus/delete.ts           # MODIFIED: authorize() checks admin.menus.delete always,
                                                   #   PLUS admin.menus.delete.force when ?force=true;
                                                   #   outbox passed through to deleteMenu

src/server/deps.ts                        # MODIFIED: createSqliteRouteDeps() wires SqliteMenuRepo /
                                           #   SqliteNavLocationBindingRepo instead of the in-memory pair
                                           #   (line ~112 today); calls rebuildNavLocationBindings() once
                                           #   at boot after the SQLite db opens.
src/server/app.ts                         # UNCHANGED: the in-memory composition root keeps
                                           #   InMemoryMenuRepo/InMemoryNavLocationBindingRepo (dev/tests) —
                                           #   this is the other rule-of-two adapter, not a legacy path to
                                           #   retire.
```

**Out of this remediation's scope (explicitly deferred, not silently dropped):**
- D-3 (routing menu mutations through the ADR-008 command gateway) — blocked upstream on the gateway's revert registry gaining menu support (`update-tree.ts`'s own doc comment); a structural change bigger than this remediation pass, and already flagged to the Coordinator in code as an open policy question.
- D-4 (`termRef` link integrity via `entry_refs`/`term_refs`) — already promoted to a named Wave-1 acceptance blocker in ADR-029's own Round-3 audit fold, gated on a content-lib schema decision (`sweep-crosscutting-decisions-20260710.md` §C-029) this ADR has no standing to make unilaterally. Treated as already-scoped elsewhere, not re-solved here.
- D-6 (real cross-write transaction for `assignLocation`'s two writes) — depends on the same command-gateway transaction machinery D-3 is blocked on; deferred together.
- D-7 (id-stability diffing across edits, not just within-submission uniqueness) — needs a tree-diff mechanism; no data-loss or security risk today (only a documented, caller-discipline-enforced simplification), so lower urgency than D-5/D-11.
- D-10 (dead `"published"` `MenuStatus` value) — this is a **product** question (OQ-03: intentional forward-reservation vs. missed requirement), not an architecture decision; recommend the feature owner rule on it directly rather than this ADR silently picking a side by, e.g., deleting the enum value or wiring a publish flow that was never asked for.
- The general "delete `navigation.manage`" cutover — see Migration Safety's Point of No Return.

## API / Event Contract Summary

What interfaces does this decision define that other agents must respect?

- `registerPermissionMigration({from, to, reason})` / `migrateDeprecatedPermissionGrants(deps)` (`src/identity/permission-migrations.ts`) — the shared rename mechanism. Members/Analytics/Integrations remediation ADRs register their own `{from, to}` pair here; they must not hand-roll a second, divergent migration function.
- `admin.menus.{read,create,update,delete,delete.force,assign,manage}` (`src/identity/permissions.ts`, `src/navigation/contracts.ts`) — the new permission catalog. `navigation.manage` remains a valid, resolvable (but deprecated) string until the Point of No Return; no code should register a *new* dependency on it.
- `SqliteMenuRepo` / `SqliteNavLocationBindingRepo` (`src/navigation/repo.sqlite.ts`) — the second rule-of-two adapter for both existing ports; TDD/Programmer must run the same contract-test suite against these as the in-memory adapters, per Article V.
- `rebuildNavLocationBindings()` (`src/navigation/reconcile.ts`) — the first real caller of `NavLocationBindingRepoPort.rebuildForWorkspace`; any future direct-SQL or bulk-import path for menus must call this after bypassing `menu-service.ts`'s normal write path (though no such path should exist per the "no side door" discipline ADR-029 already names).
- `navigation.menu.{created,updated,deleted}` / `navigation.location.{assigned,unassigned}` outbox events (`src/navigation/contracts.ts` `NAVIGATION_EVENTS`, now actually published) — future consumers (cache invalidation, search reindex, AI memory) may subscribe; the payload shape is `NavMenuChangedPayload`/`NavLocationChangedPayload`, already declared and unchanged by this ADR.

## Enforcement

How do we prevent violations?
- Code Review Agent flags any new permission-rename code outside `src/identity/permission-migrations.ts` — sibling remediation ADRs (Members/Analytics/Integrations) must call the shared function, not copy it.
- Code Review Agent verifies all six route files switch to the new action-specific `admin.menus.*` string in the same PR as the catalog change — no partial cutover (mirrors ADR-PIPE-007's identical rule for its own brownfield consumers).
- Code Review Agent verifies `migrateDeprecatedPermissionGrants()` has the additive-only/idempotency test pair (Migration Safety, Reconciliation Checks) before approving the PR that wires it into `seedIdentity()`.
- Code Review Agent verifies both new SQLite adapters (`SqliteMenuRepo`, `SqliteNavLocationBindingRepo`) pass the same contract-test suite the in-memory adapters already pass — no adapter drift.
- Code Review Agent flags any direct write to `nav_location_bindings` outside `menu-service.ts`'s existing chokepoint functions or `reconcile.ts`'s rebuild path — mirrors ADR-029's own "load-bearing discipline" warning and ADR-027's four-table import-graph lint precedent.

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| II — Test-First | This remediation was dispatched directly to the Software Architect stage against an as-built backfill spec that does not itself describe this new work; producing the ADR first (with a spec-equivalent Contract Map) is what the dispatch instruction asked for. | Block this ADR entirely and route to the Spec Agent for a SPEC-012 v1.1 first. | Considered and recommended as remediation path (a) in the Constitution Check — this ADR does not skip that step, it names it explicitly as a precondition before TDD/Programmer proceed, rather than silently treating itself as sufficient. |
| VIII — Observability | Adding full `authorize()`-decision logging (which permission string matched) is needed before `navigation.manage` can be safely deleted, but is not required to close D-5/D-11/D-1/D-2/D-9/D-8 themselves. | Add the logging now, in this same pass. | Scoped out to keep this remediation's diff focused on the five deviations it targets; named as a explicit precondition for the Point of No Return rather than dropped silently. |

## Related Decisions

- Extends: ADR-029 (Menus/Navigation, ACCEPTED 2026-07-10) — this ADR closes a named subset of its own disclosed implementation drift; ADR-022 (write chokepoint/revisions — unchanged, D-3 remains deferred); ADR-009 (outbox events — reused unchanged); ADR-021 (flat permission strings, `authorize()` as one evaluator — the permission-migration mechanism is built to preserve this, not to add a second evaluator); ADR-006 (rule-of-two — completed for both navigation ports); ADR-015 (Drizzle/SQLite — reused unchanged); ADR-028 §7 (the `settings.write` deprecation precedent this ADR's migration mechanism generalizes)
- Relates to: SPEC-012 (the as-built backfill this ADR remediates against); the sibling remediation ADRs for Members, Analytics, and Integrations (expected to reuse `src/identity/permission-migrations.ts` for their own `<domain>.manage` → `admin.<section>.<action>` rename); `sweep-crosscutting-decisions-20260710.md` §E (the frozen permission-namespace convention this ADR implements for Menus)
