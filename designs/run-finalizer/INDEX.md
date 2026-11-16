# Run finalizer design: index

Status: **COMPLETE, revision 2** (design only; nothing executed, no source changed). 2026-11-16.
Revision 2 answers the Codex gpt-6.1-sol HIGH judgment (`CODEX-JUDGE.md`, verdict "needs rework": 1 blocker, 6 majors, 3 minors). All 10 findings were checked against the code. 10 accepted, 0 rebutted. Blockers left: 0.
Branch: `plan/run-finalizer-design-2026-11-16` (from `plan/terra-2026-11-15`).
Code read: Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `integ/wave-b-r2` @ `02edbb68`.

## Files

| File | What it holds |
|---|---|
| `DESIGN.md` | The whole design, revision 2. Last section: `## Judge response` |
| `CODEX-JUDGE.md` | The judgment this revision answers |
| `INDEX.md` | This page |

## Where to look in DESIGN.md

| Section | Content |
|---|---|
| 0 | Summary in 7 points |
| 1 | Verified inventory: declarations by line, 12 responsibilities, every consumer, the stale Jini copy, other Jini owners checked |
| 2 | Call graph, mutable state and its owner, late and eager reads, the four time sources |
| 3 | What is generic and what is host |
| 4 | Target folder trees, port signatures, slice contracts, the late-binding hand-off per phase (4.2), port bindings (4.3), two guarantees kept from the Jini copy (4.4) |
| 5 | Safety mechanisms, the two concurrency boundaries (durable CAS, external launch), process death at every step, rejections, concurrency, timeouts per request and per operation |
| 6 | Five suspected defects (F1 to F5); F5 is fixed in Phase X, the rest are pinned |
| 7 | Migration: Phase 0 (about 45 characterization cases, one predicate and one mutation each), Phase X (1 fix), Phase A (7 commits in Tovu), Phase B (2 commits; the Jini copy's 26 tests reconciled row by row), Phase C (2 commits) |
| 8 | Interaction with untangle C6 / R4-chat (hard prerequisite of B1), C0, daemon R7/R8, size designs 01/02 |
| 9 | Estimate, with the change from revision 1 |
| 10 | Owner decisions OD-1 to OD-9 |
| 11 | The 12 owner practices, the 11 lessons, the judge's 4 recurring classes |
| 12 | What was not verified |
| Judge response | One row per finding: verdict, evidence checked, what changed |

## What changed in revision 2

| Judge finding | Change |
|---|---|
| 1 Blocker: B2 breaks late binding | The engine has no setter methods and no cells. `recoveryDaemon` and `onAttemptEnded` are function ports called at every use. The shared wrapper moves in B2 with no edit; C1 and C2 gate B2. Cells and install methods exist only in Phase C, on the Tovu object |
| 2 Launching a terminal successor | The CAS and the launch are treated as two boundaries. New suspected defect F4, with a second, wider window found during the launch request. Pinned by C16 and C17; OD-8 |
| 3 C6, C13, C14 not mutation-sensitive | Split into C6a to C6e, C13a to C13e, C14 with a concurrency count; each names one predicate and a schedule that reaches it |
| 4 Crash is not a rejection | C11 split: rejection matrix (C11-R), halt-harness crash matrix (C11-H), one real `SIGKILL` (C11-P), guard races (C11-G1 to G3) |
| 5 C5, C15 not a green contract | C5 asserts a delta against the deadline timer that already exists. C15 is run-time exports per stage, object keys, and a type contract; its edits are listed per commit. `npm run typecheck:tests` added to every gate |
| 6 Jini baseline not reconciled | All 26 tests of the copy have a row. Body cancel kept (fix X1). Reporter containment kept (`reportSafely`). Seven deliberate differences named D1 to D7 |
| 7 B1 purity depended on an option | Untangle C6 + R4-chat is a hard prerequisite of B1. One target shape: `RunFinalizerPorts.agents` |
| 8 Args convention | New port methods take `(required, optional?: {})`. Four zero-argument functions are listed as exceptions (OD-9) |
| 9 Bounds too strong | Checkpoint-loss bound restated with its assumptions. Request timeouts separated from whole operations. Boot cost per row corrected; C18 |
| 10 A late-install test exists | C1 is the existing test at `assistant-chat-recovery.unit.test.ts:201-214`. C2 stays new |

## Key numbers

| Fact | Value |
|---|---|
| File | `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts`, 809 lines, 7 exports (4 interfaces, 3 functions), 1 module-level `WeakMap` |
| Files that reference it | 24 including itself: 4 production, 15 test files (109 test call sites), 2 scripts, 2 debt JSON files |
| Recorded debt | 3 size entries (functions of 101 and 325 lines, file of 580 counted lines), 1 complexity entry (11) |
| Existing Jini owner | `@jini-ai/chat/server/run-finalizer`, 248 lines, 26 tests, no importer anywhere |
| Target | 9 engine files (largest about 190 lines) and 15 ports in Jini; 3 files in Tovu (HTTP adapter, origins, binding) |
| Estimate | about 1.85M Sonnet + 130k Opus (was 1.56M + 90k); Phase 0 + X + A alone about 970k |

## Owner decisions

| # | Decision | Status |
|---|---|---|
| OD-1 | Engine home | **Resolved: move to Jini, replace the stale copy, reconcile its baseline** |
| OD-2 | Shared instance: `RouteDeps.assistantRuns()` (recommended) or keep the `WeakMap` | open; needed for Phase C |
| OD-3 | Two timer ports (recommended) or one | open |
| OD-4 | Keep `runStatus` as an HTTP status number (recommended) | open |
| OD-5 | Fix unredacted logs and silent catches after the refactor, red-first (recommended) | open |
| OD-6 | Pin F1 to F4 now, fix separately (recommended) | open |
| OD-7 | Accept the breaking change to the Jini export, API and behaviours D1 to D7, in the next 0.x (recommended) | open; needed for B1 |
| OD-8 | New. F4: fix in Jini `recover.ts` as its own red-first change (recommended) | open; does not block the refactor |
| OD-9 | New. Leave zero-argument functions outside practice 2 (recommended) | open |

Fix X1 (cancel unusable response bodies) follows from OD-1 and needs no new decision. The owner can veto it; the alternative is to record the missing cancel as an accepted regression.

## What can start now

1. Phase 0: characterization tests, green on the unmodified tree, each named mutation run once.
2. Phase X: fix X1, red-first.
3. Phase A, commits A1 to A7, each green alone.

Not yet:
- B1 waits for untangle C6 and R4-chat to merge in Jini (`recover.ts` without `@jini-ai/agent-runtime`, `RecoveryPorts.agents`), and for OD-7.
- B2 waits for B1.
- Phase C waits for OD-2 and size design 01; one moved line is shared with size design 02.

## Flags

- The brief names 20 rules in `size-designs/LESSONS-FOR-DESIGN-BRIEFS.md`. The file on `plan/size-designs-2026-11-16` holds 11. All 11 were applied.
- Practice 9 conflict: `reportSafely` swallows a throw from the log or span port. It is the only way to keep a host reporter from changing run behaviour.
- Practice 2 is met only partly (OD-9).

## Not verified (full list in DESIGN.md §12)

No test, typecheck or lint of either repository was run, and no named mutation was run. F1 to F5 come from reading code; two small Node scripts outside the repositories support the body-cancel and reporter findings. The `Tracker` to `RunSpanPort` assignability and the child-process seam of C11-P need a check at dispatch.
