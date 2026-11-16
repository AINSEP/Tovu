# Run finalizer design: index

Status: **COMPLETE** (design only; nothing executed, no source changed). 2026-11-16.
Branch: `plan/run-finalizer-design-2026-11-16` (from `plan/terra-2026-11-15`).
Code read: Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `integ/wave-b-r2` @ `02edbb68`.

## Files

| File | What it holds |
|---|---|
| `DESIGN.md` | The whole design: inventory, dependency graph, generic/host split, target shape, correctness, migration, decisions |
| `INDEX.md` | This page |

## Where to look in DESIGN.md

| Section | Content |
|---|---|
| 0 | Summary in 7 points |
| 1 | Verified inventory: declarations by line, 12 responsibilities, every consumer, the stale Jini copy, other Jini owners checked |
| 2 | Call graph, mutable state and its owner, late and eager reads, the four time sources |
| 3 | What is generic and what is host |
| 4 | Target folder trees, port signatures, slice contracts, port bindings checked for behaviour |
| 5 | Safety mechanisms, crash at every step, concurrency with a live run, clock and timeouts |
| 6 | Three suspected defects (F1 to F3), pinned and not fixed |
| 7 | Migration: Phase 0 (15 characterization tests, each with the mutation that fails it), Phase A (7 commits in Tovu), Phase B (2 commits, Jini then Tovu), Phase C (2 commits) |
| 8 | Interaction with untangle lanes R4-chat, C6, C0, daemon R7/R8, size designs 01/02 |
| 9 | Estimate |
| 10 | Owner decisions OD-1 to OD-7 |
| 11 | The 12 owner practices, checked one by one |
| 12 | What was not verified |

## Key numbers (all measured on the commits above)

| Fact | Value |
|---|---|
| File | `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts`, 809 lines, 7 exports, 1 module-level `WeakMap` |
| Files that reference it | 24 including itself: 4 production, 15 test files (109 test call sites), 2 scripts, 2 debt JSON files |
| Recorded debt | 3 size entries (functions of 101 and 325 lines, file of 580 counted lines), 1 complexity entry (11) |
| Existing Jini owner | `@jini-ai/chat/server/run-finalizer`, 248 lines, 26 tests, no importer anywhere |
| Target | 8 engine files (largest about 190 lines) in Jini; 3 files in Tovu (HTTP adapter, origins, binding) |
| Estimate | about 1.56M Sonnet + 90k Opus; Phase 0 + A alone about 730k |

## Decisions the owner must make before dispatch

1. **OD-1** Engine home: move to Jini and replace the stale copy (recommended), or delete the Jini copy and keep the engine in Tovu.
2. **OD-2** Shared instance: `RouteDeps.assistantRuns()` (recommended), or keep the per-ledger `WeakMap` as an exception to practice 1.
3. **OD-3** Keep two timer ports so the checkpoint timer stays unref'd (recommended), or unify.
4. **OD-4** Keep `runStatus` as an HTTP status number in this refactor (recommended).
5. **OD-5** Fix the unredacted logs and silent catches after the refactor, red-first (recommended).
6. **OD-6** Pin F1 to F3 now and fix them separately (recommended).
7. **OD-7** Accept the breaking change to the Jini export in the next 0.x, with no alias (recommended).

Phase 0 and Phase A need none of these answers and can be dispatched now.

## Order of work

1. Phase 0: characterization tests, green on the unmodified tree.
2. Phase A, commits A1 to A7, each green alone.
3. Phase B (after OD-1): B1 in Jini, then B2 in Tovu. Rebase B1 on untangle R4-chat/C6 if they merged first.
4. Phase C (after OD-2): after size design 01; coordinate the one moved line with size design 02.

## Not verified (full list in DESIGN.md §12)

No test, typecheck or lint was run. F1 to F3 come from reading code. The `Tracker` to `RunSpanPort` assignability needs a `tsc` check at dispatch. Size designs 01/02 were searched by keyword, not read in full.
