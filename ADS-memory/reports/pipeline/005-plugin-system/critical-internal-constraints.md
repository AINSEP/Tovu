# Critical Internal Constraints: plugin-system

- Spec: SPEC-005 v1.0.0 (hash: sha256:0464c86642d343d3633cf6ee204af7b96d7b0716b1af17b49cdc99f236266c68)
- ADR: ADR-005-ARCH
- Implementation Outline: `reports/pipeline/005-plugin-system/implementation-outline.md`
- Prior designations consulted: searched `reports/pipeline/*/critical-internal-constraints.md` for prior designations touching `src/features/post/post.ts`, `src/core/commands/*`, or any plugin/extension-loading unit — **none found**. This is the first CIC artifact touching `post.ts`'s write path and the first for any plugin-loading unit in this project.
- Status: PRODUCED
- Trigger result: Security-Critical Sequencing (2 units: U-001, U-002), Algorithmic Correctness (1 unit: U-003), Failure/Recovery (1 unit: U-004), Stateful Protocol (1 unit: U-005)
- Source sync: verified 2026-07-28 — all `C-xxx`/`INV-xxx` references below exist in `implementation-outline.md` as written this session.
- Date: 2026-07-28
- Author: Software Architect

## Trigger Decision Matrix

| Trigger | Applies? | Designated Unit(s) | Plausible Wrong Implementation | Broken Property | Required Constraint | Source Trace |
|---|---:|---|---|---|---|---|
| Algorithmic Correctness Constraint | yes | U-003 | Conditionally omit an ungranted capability's property from the SDK object (`if (caps.includes(...)) sdk.content = {...}`) instead of installing a throwing stub | AC-05's exact `CAPABILITY_DENIED` error-code contract; BR-07's classified-500 fail-closed mapping | Every capability surface must always be present on the SDK object; ungranted surfaces are stubs that throw a typed `CAPABILITY_DENIED`, never an absent property producing an uncaught `TypeError` | REQ-04; AC-05; EC-06; BR-04-cap; BR-07 |
| Stateful Protocol Constraint | yes | U-005 | Implement gateway revert by calling the same `updatePost`/`createPost` used for genuine saves (natural code-reuse temptation), rather than a raw repo write | BR-08's "revert shall NOT fire `content.entry.beforeSave`"; AC-17's exact-restore guarantee | The revert/restore code path must call `PostRepoPort.save()` directly with the stored pre-image, never through `createPost`/`updatePost` | BR-08; AC-17 |
| Concurrency / Ordering / Idempotency Constraint | no | — | — | — | — | Load pipeline execution is single-threaded/sequential per plugin by construction (TB-01 deterministic order); no concurrent plugin `import()`s are specified or needed in v1 — checked and no trigger applies beyond what U-001/U-002's orderings already cover |
| Security-Critical Sequencing Constraint | yes | U-001, U-002 | U-001: `import()` the plugin's code before (or interleaved with) the integrity/`sdkRange` checks, e.g. to "peek" at exported metadata first. U-002: register the `module.register()` hook lazily/on first plugin load rather than unconditionally at boot, or register it after routes are already accepting traffic | U-001: INV-04 ("must never load if integrity or sdkRange fails") and the whole verify-before-trust promise the spec's Constitution Compliance table names as the new attack surface's core mitigation. U-002: ADR-005 rule 1 (public API = SDK exports only) and the SDK-resolution mechanism's own anti-spoofing property (a plugin could plant a local `node_modules/@tovu/sdk` and have it resolve before the intended hook wins the specifier) | U-001: integrity + `sdkRange` verification must both complete successfully before the first byte of the plugin's code is evaluated (before `import()` is called at all). U-002: the SDK-resolution hook must be registered exactly once, synchronously, during process boot, before any HTTP route or boot step that could lead to a plugin `import()` is reachable | INV-04; BR-01; AC-03/AC-04; ADR-005 rule 1; ADR SDK Resolution Mechanism |
| Explicit Performance Budget Constraint | no | — | — | — | — | No spec or NFR names a numeric latency/throughput budget for the load pipeline or hook composition — this gap is recorded in the ADR's `scalability` scorecard axis and Re-evaluation Triggers, not here (no budget ⇒ no trigger, per this skill's own rule) |
| Failure / Recovery Constraint | yes | U-004 | Persist the entry first via the existing `repo.save()` call and run the plugin hook composition as a second, follow-up write (or run the hook after constructing the final `PostRecord` but catch its failure too loosely, allowing a partial commit) | BR-06 ("written in the same transaction as the SPEC-002 entry write"); BR-07/EC-10's "entry shall be unchanged, NO change set shall be recorded" fail-closed guarantee; AC-05's "no partial write" | Hook composition (`runBeforeSave`) must fully resolve or throw, and any thrown/denied/invalid result must abort the entire `createPost`/`updatePost` call **before** `deps.repo.save()` is invoked — there is exactly one `repo.save()` call per create/update, and its `ext` field is only ever the successfully-merged patch | BR-06; BR-07; AC-01/AC-05; EC-10 |
| Characterization Parity Constraint | no | — | — | — | — | No brownfield behavior is being preserved/ported here — `post.ts`'s existing behavior for callers that don't wire `beforeSaveHook` must simply be *unchanged*, which is a regression-test concern already captured as a Contract Map note (C-014) and a Test Expectation in the Implementation Outline, not a quirk-preservation constraint this artifact needs to restate |

## Designated Units

| Unit ID | Name | Location (module / contract ref) | Designating Trigger(s) | Outline Refs | Trace |
|---|---|---|---|---|---|
| U-001 | Load pipeline verify-before-import ordering | `src/features/plugin-runtime/loader.ts` (`loadPlugin`) | Security-Critical Sequencing | C-008, INV-001 | BR-01; INV-04; AC-03/AC-04 |
| U-002 | SDK-resolution hook registration-before-reachability | `src/server/boot/plugin-sdk-resolver.ts` (`registerPluginSdkResolver`) | Security-Critical Sequencing | C-015, INV-002 | ADR SDK Resolution Mechanism; ADR-005 rule 1 |
| U-003 | Capability-scoped SDK: stub-vs-absent for ungranted surfaces | `src/features/plugin-runtime/capability-sdk.ts` (`buildCapabilityScopedSdk`) | Algorithmic Correctness | C-009 | REQ-04; BR-04-cap; AC-05; EC-06 |
| U-004 | Hook-then-single-write fail-closed atomicity | `src/features/post/post.ts` (`createPost`/`updatePost`) + `src/features/plugin-runtime/hook-registry.ts` (`runBeforeSave`) | Failure / Recovery | C-010, C-014, W-003 | BR-06; BR-07; AC-01/AC-05; EC-10 |
| U-005 | Revert must never re-fire the hook | `src/core/commands/revert.ts` (existing) + `src/features/post/post.ts` boundary | Stateful Protocol | W-005, INV-003 | BR-08; AC-17 |

## Unit Constraints

### U-001 Load pipeline verify-before-import ordering

- Responsibility: decide, for one candidate plugin, whether its code may ever be executed.
- Designation: Security-Critical Sequencing — a competent implementer might reorder steps for convenience (e.g. `import()` first to read a runtime-reported version string for a nicer error message) and thereby execute tampered or incompatible code before rejecting it; this breaks INV-04 and the fail-closed promise the spec's Constitution Compliance table names as this feature's core Article VI mitigation; the required constraint is a hard ordering: integrity, then `sdkRange`, then (and only then) `import()`.
- Outline refs: C-008, INV-001

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-001-B1 | `loadPlugin()` must verify every packaged file's integrity hash and confirm `sdkRange` satisfaction before calling `import()` on the plugin's entry file, for every load (boot and enable-time alike) | ESCALATE_SECURITY | Tampered or incompatible code must never execute, even transiently | Observable: integration test with a tampered fixture artifact asserting `import()` was never invoked (a spy/counter on the dynamic-import call site, or an observable side effect the fixture would produce only if imported) and that the plugin is listed `invalid`/`incompatible` with no partial registration | INV-04; BR-01; AC-03/AC-04 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-001-ORD1 | Integrity verification completes successfully, THEN `sdkRange` check completes successfully, THEN (and only then) `import()` is called | A failing check must short-circuit before any code execution — reversing this order lets a tampered/incompatible plugin's module-eval-time code run before rejection | A tampered fixture's plugin (e.g. one whose entry file writes an observable marker at module top-level) never produces that marker when loaded | ESCALATE_SECURITY | BR-01; INV-04 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-001 | `implementation-outline.md` Critical Invariants | U-001-B1, U-001-ORD1 |

#### Design Context (optional, non-binding)

BR-01 already states this ordering in the spec text; this designation exists because "the spec says the order" and "the implementation is guaranteed to preserve it under refactoring pressure" are different guarantees — this unit is exactly where a later, well-intentioned refactor (e.g., "let's cache the parsed manifest and check `sdkRange` lazily") could silently invert the order without failing any AC that only exercises the happy path.

---

### U-002 SDK-resolution hook registration-before-reachability

- Responsibility: ensure `@tovu/sdk`/`@tovu/*` bare-specifier resolution always redirects to the runtime's own bundled SDK, for every plugin `import()` that will ever happen in this process.
- Designation: Security-Critical Sequencing — a plausible wrong implementation registers the `module.register()` hook lazily (e.g., the first time `loadPlugin()` runs) rather than unconditionally at process boot before routes accept traffic; this creates a window (however small) in which a plugin `import()` could occur before the hook exists, falling through to ordinary Node module resolution, which could resolve `@tovu/sdk` to a plugin-planted local `node_modules/@tovu/sdk` instead of the runtime's real one — defeating both ADR-005 rule 1 (public API = SDK exports only, deep imports blocked) and this ADR's own anti-spoofing rationale for choosing the hook mechanism in the first place.
- Outline refs: C-015, INV-002

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-002-B1 | `registerPluginSdkResolver()` must be called exactly once, synchronously, during `src/index.ts`'s boot sequence, before any route is registered and before any code path that could reach `loadPlugin()` is wired into the running process | ESCALATE_SECURITY | No plugin `import()` may ever be reachable before the resolution hook exists | Observable: a process-level integration test that starts the boot sequence with a deliberately-planted conflicting local `node_modules/@tovu/sdk` fixture near a plugin fixture, and asserts the plugin's `import { definePlugin } from '@tovu/sdk'` resolves to the runtime's real SDK build, never the planted one | ADR SDK Resolution Mechanism; ADR-005 rule 1 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-002-ORD1 | `registerPluginSdkResolver()` completes BEFORE `app.listen`/route registration BEFORE any request can trigger `discoverPlugins()`/`loadPlugin()` | Reversing this order creates a real (if narrow) window where a plugin import could bypass the intended resolution and pick up a spoofed `@tovu/sdk` | The same planted-shadow-package integration test as U-002-B1, run against the actual boot entrypoint (`src/index.ts`), not a unit harness that skips real boot ordering | ESCALATE_SECURITY | ADR SDK Resolution Mechanism |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-002 | `implementation-outline.md` Critical Invariants | U-002-B1, U-002-ORD1 |

#### Design Context (optional, non-binding)

This unit is genuinely new architecture-level content discovered during this ADR pass — SPEC-005's own `state.spec.md` never addresses how `@tovu/sdk` physically resolves for a plugin loaded from an arbitrary install-dir path outside the runtime binary's own `node_modules` (ADR-011's standalone single-binary topology). The mechanism (Node's `module.register()`) is chosen and justified in the ADR's "SDK Resolution Mechanism" sub-decision; this CIC unit records only the ordering property that mechanism's safety depends on.

---

### U-003 Capability-scoped SDK: stub-vs-absent for ungranted surfaces

- Responsibility: build the exact `PluginSdk` object handed to one plugin's `setup()` call, reflecting precisely its declared capabilities.
- Designation: Algorithmic Correctness — REQ-04 says the SDK object "exposes only the granted surface," which a competent implementer might satisfy by simply omitting ungranted properties (`sdk.content = caps.includes('content.extend') ? {...} : undefined`). That satisfies "the surface isn't usable" but breaks AC-05's specific contract: invoking an ungranted surface must produce a classified `CAPABILITY_DENIED` that the hook runner can catch and map to `PLUGIN_HOOK_FAILED` (BR-07) — a bare property-access `TypeError` on `undefined` is a different, uncaught failure mode that a naive `try/catch` around the whole hook call might still happen to catch, but which is not the specified, testable error identity AC-05 requires, and is fragile to catch correctly if the plugin's own code also happens to use optional chaining defensively.
- Outline refs: C-009

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-003-B1 | For every one of the three v1 capability surfaces (`content.read`, `content.extend` i.e. `content.extend`/field declaration, `hooks.attach` i.e. `addFilter`), the `PluginSdk` object must always expose a callable at that surface's position — granted capabilities get the real implementation, ungranted capabilities get a stub that synchronously throws a `CAPABILITY_DENIED`-typed error identifying the missing capability | ESCALATE_SECURITY | AC-05's exact error-code contract and BR-07's fail-closed classification depend on `CAPABILITY_DENIED` being a distinguishable, thrown, typed error — not an absent-property `TypeError` | Observable: unit test constructing the SDK with each of the 8 possible capability-subset combinations (2³) and asserting every ungranted surface throws `CAPABILITY_DENIED` specifically (not any other error type) when invoked | REQ-04; BR-04-cap; AC-05; EC-06; INV-02 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| — (no separate outline INV-xxx; this ties directly to spec-level INV-02) | feature.spec.md | U-003-B1 |

#### Design Context (optional, non-binding)

This is a small unit but a classic "the AC reads simple, the naive implementation reads plausible, and they quietly diverge" trap — worth designating precisely because it is cheap to get wrong and cheap to get right once named.

---

### U-004 Hook-then-single-write fail-closed atomicity

- Responsibility: guarantee that a content-entry save either (a) persists exactly once, with core fields and any plugin-derived `ext` together, or (b) persists nothing at all and records no change set.
- Designation: Failure/Recovery — a plausible wrong implementation treats "run the hook" and "save the entry" as two separate steps that could be implemented as two writes (or as one write immediately followed by a corrective second write once `ext` is known), which would violate BR-06's single-transaction requirement and could leave a saved entry with stale/missing `ext` if the process crashes between the two writes, or could let AC-05's "no partial write" guarantee fail if the hook throws after a first write already landed.
- Outline refs: C-010, C-014, W-003

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-004-B1 | `createPost`/`updatePost` must call `runBeforeSave()` (or the no-op default) and fully resolve or catch-and-propagate its result BEFORE constructing the final `PostRecord` passed to `deps.repo.save()`; there is exactly one `repo.save()` call per `createPost`/`updatePost` invocation, and it is never called if `runBeforeSave()` throws | — (Failure/Recovery default; not security/irreversible-marked because SPEC-001's existing revert mechanism already bounds the blast radius of any implementation slip here to "a save that shouldn't have partially landed," not permanent/unrecoverable damage) | BR-06 (same-transaction write); AC-05/EC-10 (no partial write, no change set on failure) | Observable: integration test — a plugin fixture whose filter throws must result in zero calls to `repo.save()` (spy/count), the entry's pre-save state unchanged, and no change set recorded, exercised through the real HTTP route (Article V) | BR-06; BR-07; AC-01/AC-05; EC-10 |

#### Failure / Recovery Constraints

| ID | Failure Point | Required Behavior | Partial-State Rule | Verification Surface | Escalation Marker |
|---|---|---|---|---|---|
| U-004-F1 | `runBeforeSave()` throws (plugin filter error, `CAPABILITY_DENIED`, or invalid `ext` write) | The containing `createPost`/`updatePost` call must propagate the failure without calling `deps.repo.save()`; the caller (route) maps it to 500 `PLUGIN_HOOK_FAILED` | No partial `PostRecord` state may be persisted; no change set may be recorded | Observable: same integration test as U-004-B1 | — |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| — (ties directly to spec-level BR-06/BR-07, no separate outline INV row needed beyond C-014's contract note) | behavior.spec.md §6–7 | U-004-B1, U-004-F1 |

#### Design Context (optional, non-binding)

The Implementation Outline already places the hook-merge call site immediately before the single `repo.save()` call in the Contract Map (C-014); this unit exists so that constraint survives as a *binding*, test-verified property rather than only a placement note a future refactor could quietly violate (e.g., by "optimizing" `updatePost` to save first and patch `ext` in a quick follow-up for perceived latency reasons — exactly the kind of change that would look harmless against every P1 AC that doesn't specifically test crash-mid-write or throw-after-first-write).

---

### U-005 Revert must never re-fire the hook

- Responsibility: guarantee that restoring a change set's pre-image is a pure data write, never a re-triggering of plugin behavior.
- Designation: Stateful Protocol — a plausible wrong implementation reuses `updatePost` (or `createPost`) for the revert/restore path, since they already know how to write a `PostRecord` and it would be tempting to avoid "two ways to write a post." This would violate BR-08's explicit "shall NOT fire `content.entry.beforeSave`" rule and AC-17's exact-restore guarantee, and — worse — could let a plugin that is enabled *now* (but wasn't at the time of the original save) stamp new, wrong `ext` data onto a historical entry during its revert, or could fail entirely if the contributing plugin has since been disabled/uninstalled (AC-17 explicitly requires revert to work even then).
- Outline refs: W-005, INV-003

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-005-B1 | The gateway revert path (`core/commands/revert.ts` restoring a `post` entity's inverse payload) must write the restored `PostRecord` via `PostRepoPort.save()` directly, never via `createPost`/`updatePost` | — (Stateful Protocol default; not security-marked, since the property protected is data-restore fidelity, not an authz/crypto boundary — but flagged for Programmer attention given its adjacency to the security-relevant U-004) | BR-08 ("shall NOT fire `content.entry.beforeSave`"); AC-17's exact-restore guarantee, including the case where the contributing plugin is since disabled/uninstalled | Observable: integration test per AC-17 — enable `word-count`, save twice (count 5→9), enable a *second*, different plugin that would also stamp `ext` if the hook fired, then revert the second save's change set and assert (a) `ext.word-count.count` returns to 5, (b) the second plugin's `ext` namespace is absent (proving its hook never ran during revert), (c) `version` increments by exactly 1 | BR-08; AC-17 |

#### State Machine (Stateful Protocol Constraint)

| ID | State | Event / Input | Next State | Guard / Precondition | Escalation Marker |
|---|---|---|---|---|---|
| U-005-SM1 | entry at version N (post-genuine-save) | genuine `createPost`/`updatePost` call | entry at version N+1, hook fires, `ext` recomputed | caller is a real content-save request, not a revert | — |
| U-005-SM2 | entry at version N+1 (post-genuine-save) | gateway revert of the change set that produced N+1 | entry at version N+2 (per AC-17's "version increments by 1" even on revert), `ext` restored verbatim from the stored pre-image, hook does NOT fire | caller is `revert.ts`'s restore path, using the stored `inversePayload`, never `createPost`/`updatePost` | ESCALATE_SECURITY *(escalation applies to this transition specifically — see below)* |

- Illegal states / transitions: a revert (U-005-SM2) that internally routes through `createPost`/`updatePost` is an illegal transition — it would make the hook fire during what must be a pure restore, corrupting `ext` fidelity and potentially violating AC-17's "revert still restores `ext` snapshot verbatim even if the contributing plugin is since disabled" guarantee (a disabled/uninstalled plugin's hook wouldn't fire at all under this illegal path, silently producing a *different* wrong result than a still-enabled different plugin stamping new data — either way, wrong).
- State persistence: `plugin_activations` (which plugins are enabled *right now*) must have zero influence on a revert's outcome — the recovery state of record is the stored `inversePayload` on the change-set item, not current activation state.

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-003 | `implementation-outline.md` Critical Invariants | U-005-B1, U-005-SM2 |

#### Design Context (optional, non-binding)

Marked `ESCALATE_SECURITY` on the SM2 transition specifically (rather than the whole unit) because the failure mode most worth escalating-before-deviating on is a *currently-enabled, different* plugin silently attributing new data to a historical entry during someone else's revert — that has a data-integrity-adjacent security flavor (unauthorized/unattributed data modification during what the operator believes is a pure undo) even though the unit as a whole is a correctness/parity concern more than an authn/crypto one.

## Deviation And Promotion Protocol

- `ESCALATE_SECURITY`-marked constraints in this artifact (U-001-B1/ORD1, U-002-B1/ORD1, U-003-B1, U-005-SM2): Programmer must pause and route to Coordinator → Software Architect before any deviation; approval requires a recorded `[CIC_DEVIATION_APPROVED]` entry per this project's CIC skill.
- U-004-B1/F1 (no default escalation marker): deviation requires only a recorded `[CIC_DEVIATION]` entry (what was done instead, why, effect on invariants/tests).
- Before final Programmer handoff on this feature, each Binding constraint above must be confirmed-still-applies, deviation-recorded, or reclassification-requested — per this project's standard CIC closeout rule.

## Downstream Handoff Notes

- Coordinator: tasks touching `loader.ts`, `plugin-sdk-resolver.ts`, `capability-sdk.ts`, `post.ts`'s hook-merge call site, or `revert.ts`'s post-entity restore path must reference their Unit IDs (U-001…U-005) in `tasks.md`.
- TDD focus: build the five designated units' verification-surface tests before general REQ/AC coverage — they are the security/correctness spine the rest of the feature hangs off. None of the five are audit-only; all have observable integration-test surfaces, so none should be deferred to source review.
- Programmer audit focus: the Architecture Audit must specifically check (a) `loadPlugin()`'s literal statement order against U-001-ORD1, (b) `src/index.ts`'s boot sequence against U-002-ORD1, (c) `buildCapabilityScopedSdk()`'s handling of every ungranted surface against U-003-B1, (d) that `createPost`/`updatePost` contain exactly one `repo.save()` call each against U-004-B1, and (e) that `revert.ts`'s post-restore path never imports or calls into `src/features/post/post.ts`'s `createPost`/`updatePost` against U-005-B1.
- Open risks or ambiguities: none beyond what the ADR's own Risks section already records (the `plugin.tier` manifest-field gap and the ABI-freeze doc-sync note) — neither affects these five units' designations.
