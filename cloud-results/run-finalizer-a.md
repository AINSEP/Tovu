# run-finalizer-a: Phase 0, Phase X and Phase A (A1 to A3) — PARTIAL

Run date 2026-11-16. Branch `refactor/run-finalizer-a` in Tovu, from `origin/refactor/terra` `80b00f5b`.
Builds on Jini `refactor/terra` `02edbb68` (linked with `link-jini.mjs`; Jini was not changed).
Design: `origin/plan/run-finalizer-design-2026-11-16:designs/run-finalizer/DESIGN.md`, revision 2.
Amendments A and B and SEQUENCE were read: they do not override this design, and SEQUENCE lists Phase 0, X and A as parallel work.

**Status: PARTIAL.** Phase 0 and Phase X are done. Phase A is done up to A3. A4 to A7 are not started: the run reached its context ceiling, not a blocker in the code.
**Next step: A4** (`run-finalizer/checkpointer.ts` and `report.ts`), then A5, A6, A7 as the design lists them.

## Commits (all pushed)

| SHA | Step | What |
|---|---|---|
| `8cc17231` | Phase 0 | C2 to C10, C15 (19 tests) and the shared port fakes |
| `91758f88` | Phase 0 | guard races C11-G1, C11-G2a/b, C13a to C13e, C16, C17 (10 tests) |
| `b0de8391` | Phase 0 | rejections C11-R (13 tests), halt matrix C11-H with C12 (8 tests), C14, C18 |
| `443f702c` | X1 | cancel the body of an unusable events response; 3 tests, red first |
| `d6488696` | X1 follow-up | the cancel moved to a helper so the big factory stays at its recorded size |
| `aa95ae20` | A1 | daemon HTTP client moved to `modules/run-daemon-http-client.ts` |
| `d0fe20d7` | A2 | `modules/run-daemon-origins.ts` extracted; client factory under 50 lines |
| `8e858aa6` | A3 | `modules/run-finalizer/watch-state.ts` and `checkpoint-policy.ts` |

## Gates

| Gate | Base `80b00f5b` | After A3 |
|---|---|---|
| The design's 15 test files | 130 tests, 129 pass | same 15 files plus 5 new: 185 tests, 184 pass |
| The one failing test | `desktop-assistant-admission.integration.test.ts`: `MODULE_NOT_FOUND` from `apps/desktop/package.json`. `apps/desktop` dependencies are not installed in this container | same failure, same cause |
| `tsc -p tsconfig.json` | not run on base | 0 errors |
| `tsc -p tsconfig.tests.json` | not run on base | 0 errors |
| `check:size` | fails: 18 worsened or stale lines, none in these files | nothing about these files |
| `check:complexity` | fails: one stale entry, for `startWatch`'s cleanup callback in this file | the same stale entry; the design removes it in A7 |
| `check:boundaries` | fails: 16 errors, 95 warnings | exit 16, no line about these files |

The three `check:*` gates are red on the base commit for reasons outside this work. The rule used here was: no new line about a file this run touched.
Each of A1, A2 and A3 was run alone against the 20 test files, both `tsc` projects, `check:size` and `check:complexity` before its commit.

## Phase 0: pins and mutation proof

52 tests in 4 files under `apps/website/src/server/__tests__/`, green on the unmodified tree. Every fake stands in for an injected port; no module is mocked.
36 mutations were applied one at a time, the named test was run, and the file was restored. All 36 made their test fail.

| Case | Mutation that fails it |
|---|---|
| C2 late `onAttemptEnded` | handler read once at construction |
| C3 previous-daemon snapshot | snapshot made lazy (and, after A2, deferred past the constructor) |
| C4 `ledger.durable` read once | second read inside `recoverWatch` |
| C5a / C5b / C5c | trailing timer routed through the scheduler / `unref()` deleted / deadline routed through `setTimeout` |
| C6a | `>=` to `>` on the deadline |
| C6b | `maxReconnects - 1`; `===` to `>` |
| C6c | `===` to `>` at the counter reset |
| C6d | deadline renewal deleted; `status !== 200` to `status === 404` |
| C6e | probe no longer bounded by `statusTimeoutMs`; `abort.abort()` deleted |
| C7 | release and handler swapped; the watch never removed from `active` |
| C8 | successor check removed; identity check removed |
| C9 (F1) | the future fix (keep `newAttempts` while a successor lives) flips it |
| C10 (F2) | a retry added inside `settle` |
| C11-G1 | `expectedRunId` check removed (Jini `recover.ts:300`) |
| C11-G2a / G2b | `watch.terminal` removed from `checkpoint` / from `retryCheckpoint` |
| C13a, C13b | reload in `decide` removed; C13b also: generation check removed |
| C13c, C13d | exclusion after reload removed; cancel check after the CAS removed |
| C12 (F3) | a 404 no longer treated as a dead attempt |
| C11-H launch grace | grace skipped: a launch appears inside the 10 s window |
| C14 | boot callback no longer awaits recovery |
| C11-R (5 rows) | no attach after a failed launch; no catch on the cancel; no retry after a rejected checkpoint; `runStatus` and `openEvents` rejections not caught |

Mutations in Jini code were applied to the built file Tovu loads (`packages/chat/dist/server/durable-runs/recover.js`) and restored; the Jini checkout is clean.

No mutation was claimed, as the design says, for C13e, C15, C16, C17, C18 and C11-G3.

## The suspected defects

| Id | Result | Pinned by |
|---|---|---|
| F1 | **Reproduced.** After a new attempt's first watch is replaced, its cancel is sent to the previous daemon's client, not the one that launched it | C9 |
| F2 | **Reproduced.** A rejected `settle` leaves the row `running` and unwatched; only a later `watch` settles it. Same for a rejected hand-off checkpoint: recovery never runs | C10, C11-R |
| F3 | **Reproduced** on the real chat database. A run that finished but was not settled is launched again when the daemon is gone too | C12 |
| F4 | **Reproduced**, both windows. A row settled between the CAS and the reload is still launched, with no watch. A third continuation is finalized `failed` while its launch is in flight, then runs and its settle returns `false` | C16, C17 |
| F5 | **Fixed** in X1 | 3 tests |

F1 to F4 were recorded, not fixed: the design says to pin them (OD-6, OD-8 are open).

## X1

Red first: on the commit before the fix the 3 tests fail with `0 !== 1` cancels. After the fix they pass.
Mutation: without the catch on the cancel, the "cancel that fails" test fails.
One correction was needed: X1 made `createAssistantRunFinalizer` 327 counted lines against a size-debt baseline of 325. `d6488696` moves the cancel into `releaseUnreadBody`. Commit `443f702c` alone is therefore over that baseline.

## Deviations from the design

1. **C11-P (one real `SIGKILL` of a child process) was not attempted.** The design allows dropping it; C11-H is the contract.
2. **Halt matrix: 8 crash points, not 9.** Path R (hand-off) has no row of its own. Its only durable step is a checkpoint, which the two K rows cover. Not covered: a crash during the reconnect delay.
3. **C11-G3 was not written again.** `assistant-run-finalizer.restart.test.ts` ("a buffered completed run settles despite a pending checkpoint") already holds a checkpoint, lets settle commit, releases it and asserts the row.
4. **C8** holds the first watch at its hand-off checkpoint instead of at the recovery delay. The predicate is the same (successor check and identity check), and both mutations fail it.
5. **C7**: "drop the inner `finally`" cannot fail a test, because the `catch` before it already contains a throwing handler. The mutation run instead removes the delete.
6. **The "boot callback without the `!message.runId` arm" mutation was not run.** Removing the arm gives the same result through recovery's own `gone`.
7. **A halted D row saves `running`, not `queued`,** after boot inside the launch grace. The test records what the code does.
8. **A2**: one `release` on the origins object; the design lists `release` and `forget`, which would be the same function.
9. **A1** deletes the file-level size-debt entry (the file is under the limit after the move, and `check:size` asks for the deletion). The design does this in A7.
10. `durable-ledger.fixture.ts` gained an optional `recoveryCount`, needed to reach the third continuation in C17.

## Found while working (not changed)

- A ledger whose `checkpoint` throws synchronously, not through a promise, would become an unhandled rejection and leave `checkpointPending` set. Real ledgers are async functions, so this does not happen today. The log port of A4 should keep it in mind.
- `checkpointDelay` and `recoverySettings` still take the whole options object. They move with their slices in A4 and A5.

## For the next run

- Start at A4 from `8e858aa6`. `Watch` and the pure helpers are already in `modules/run-finalizer/`.
- The mutation runner and its 36 specs lived in the session scratchpad and are gone. The table above names each mutation.
- Gate commands: the 15 files of design section 1.3 plus `assistant-run-finalizer.{characterization.unit,races.unit,rejections.unit,halt-matrix.integration,unusable-body.unit}.test.ts`, run with `--test-concurrency=1`.
- C15a must be edited again in A7 (the table in design section 7).

# Run 2

Run date 2026-11-16. Same branch, continued from `94ed0c92`. Builds on Jini `refactor/terra` `02edbb68` (linked; Jini was not changed).
Amendments A and B and SEQUENCE were read again: they still do not override this design.

**Status: Phase A is COMPLETE (A4, A5, A6, A7).** Phases 0, X and A are all done.
**Next step: B1** (engine to Jini). It is blocked, as the design says, on untangle C6 + R4-chat row 390 in Jini and on OD-7. Nothing in Tovu is waiting.

## Commits (all pushed)

| SHA | Step | What |
|---|---|---|
| `b50d8872` | A3 follow-up | `makeWatch` and `interruptionEvents` moved to `watch-state.ts` (design 4.1 lists them there) |
| `6704e2f6` | pin | the `console.error` line of a rejected checkpoint: exact text and arguments |
| `2394c57e` | A4 | `run-finalizer/checkpointer.ts`, `report.ts`, `ports.ts` |
| `61ec8d89` | A5 | `run-finalizer/stream.ts`, `bounded-follow.ts` |
| `8c531514` | A6 | `run-finalizer/recovery-binding.ts` |
| `c2217f6f` | pin | the `console.error` line of a failed watch: exact text and arguments |
| `ccfc1a12` | A7 | `run-finalizer/entry.ts`, `shared.ts`; `assistant-run-finalizer.ts` deleted; callers repointed; debt entries removed |
| `18618b08` | A7 follow-up | two closures in `entry.ts` destructure what they forward (args audit) |

## Result

`modules/run-finalizer/` now holds 9 files: `ports.ts` 21 lines, `report.ts` 23, `shared.ts` 35, `checkpoint-policy.ts` 48, `stream.ts` 74, `recovery-binding.ts` 81, `watch-state.ts` 104, `checkpointer.ts` 147, `bounded-follow.ts` 177, `entry.ts` 299.
Every function is under 50 lines and under complexity 10 by the lint tools, not by reading: `check:size` and `check:complexity` print nothing about these files.
Neither debt file names these paths any more. No file re-exports the old path.

## Gates

Each of the 8 commits was gated alone, before it was committed.

| Gate | Start of run 2 (`94ed0c92`) | After `18618b08` |
|---|---|---|
| Finalizer test files | 20 files, 185 tests, 184 pass | 22 files, 199 tests, 198 pass |
| The one failing test | `desktop-assistant-admission.integration.test.ts`: `Cannot find module 'electron'` from `apps/desktop/package.json` (not installed here) | same failure, same cause. Its import was repointed in A7 and typechecks |
| `tsc -p tsconfig.json` | 0 errors | 0 errors |
| `tsc -p tsconfig.tests.json` | 0 errors | 0 errors |
| `check:size` | fails; no line about these files | same output, line for line |
| `check:complexity` | fails; one line was ours (the stale `startWatch` entry) | that line is gone; the rest is unchanged |
| `check:boundaries` | exit 16 (16 errors, 95 warnings) | exit 16, same counts, no line about these files |

Test count: 185 + 2 pins + 3 (A4) + 9 (A7) = 199. No test was deleted or weakened. The 52 Phase 0 pins are green at every commit. C15a was edited once, in A7, as the design's table says.

## New tests and their mutation proof

| Test | Where | Mutation that fails it |
|---|---|---|
| a rejected checkpoint is logged once (pin) | `assistant-run-finalizer.reporting.unit.test.ts` | second argument changed to `String(error)`. Run before A4 and again after A7 |
| a watch that fails is logged once (pin) | same file | argument stringified; call removed. Run before A7 and again after |
| a log that fails does not stop the backed-off retry (3 ways) | `run-finalizer/__tests__/checkpointer.unit.test.ts` | log call not through `reportSafely` (3 fail); `reportSafely` ignores a rejected promise (1 fails); retry removed (3 fail) |
| a log, a `setOutcome`, a cleanup warning that fail (3 ways each, 9 tests) | `assistant-run-finalizer.reporting.unit.test.ts` | each of the three `reportSafely` wrappers removed in `entry.ts`: its 3 tests fail |

The pins were green on the tree before the change they guard. The 9 A7 tests cannot pass before A7: without `reportSafely` a failing reporter rejects the watch and `idle()` rejects.

## Phase 0 mutations run again on moved code

All were applied to the file the code lives in now, one at a time, and the file restored. Every one made its test fail.

| After | Mutations | Target file |
|---|---|---|
| A4 | C5a, C5b, C11-G2a, C11-G2b, C11-R (no retry after a rejected checkpoint) | `checkpointer.ts`, timer binding |
| A5 | C5c, C6a, C6b (2), C6c, C6d (2), C6e (2), C11-R (`runStatus`, `openEvents` rejections), X1 (404, 503, cancel that rejects) | `bounded-follow.ts`, `stream.ts` |
| A6 | C1 (2: snapshot in the factory, snapshot in the binding), C9, C12 | `recovery-binding.ts` |
| A7 | C1, C2, C4, C5a, C5b, C7 (2), C8 (2), C9, C10, C14, C15a (an extra export) | `entry.ts` |

That is 26 of the mutation runs in the run 1 table, plus C1, X1 and C15a.
Not run again, because this run did not move their target: C3 (`run-daemon-http-client.ts`, A2) and the ones in Jini's built `recover.js` (C11-G1, C13a to C13d, the launch grace, attach after a failed launch, the catch on the cancel). C13e, C16, C17, C18 and C11-G3 have no mutation, as in run 1.

## Deviations from the design

1. **Three commits the design does not list.** `b50d8872` moves two functions that design 4.1 places in `watch-state.ts` but A3 left in the factory. `6704e2f6` and `c2217f6f` pin two log lines that Phase 0 did not cover, before the log port carries them.
2. **`createCheckpointer` returns `{ onFrame }`, not `{ onFrame, clear }`.** `Watch.trailing` is now the cancel function the timer port returns. `stopWatch` cancels it through `clearTrailing` in `watch-state.ts`. A `clear` method would only forward to that.
3. **A5 has one input the design's list omits: `recoveryAvailable`.** `resolveStreamOutcome` hands a failed end to recovery only when a recovery exists. `probeRun` and `delay` are exported from `bounded-follow.ts` because the recovery ports and the hand-off use them too.
4. **`ports.ts` holds three types, not eight.** `RunTimerPort`, `RunLogPort`, `RunWatchOutcome`. The tracker stays the `Tracker` type in Tovu; `RunSpanPort` and the rest belong to B1. Whether `Tracker` fits `RunSpanPort` is still not checked.
5. **`settle`, the hand-off (`recoverWatch`), `retainLive` and the boot callback live in `entry.ts`.** The design names no file for them. `entry.ts` is 299 lines (the design guessed about 140): it also carries the 30-line header comment and the two public types.
6. **A reporter's result is returned by the console binding**, so `reportSafely` also contains a reporter that rejects later. Only a replaced console can show the difference.
7. **One small behaviour change in A7, as the design asks:** a `setOutcome` that throws is contained. Before, it was turned into an `abandoned` outcome and a log line. The real tracker does not throw.
8. **`checkpointIntervalMs` is a required key typed `number | undefined`** in the one argument object the design gives `createCheckpointer`.

## Owner audits (files this run changed)

| Audit | Before | After | New |
|---|---|---|---|
| `owner-rules-audit.mjs` | 9 | 10 | **1**: `swallowed-error` in `report.ts` (`reportSafely`). The design flags it (4.4, practice 9). The other moved findings are the same lines in new files |
| `args-object-audit.mjs` | 9 violations, 10 unsure | 9 violations, 0 unsure | 0. The 9 are callbacks that implement an existing typed port |
| `hook-injection-audit.py` | 0 | 0 | 0 (no `.tsx` file was touched) |

## Left as found

- `.cloud-coord/job-f-complexity.json` still names the old path twice. It is a coordination record, not read by any check.
- Jini `packages/chat/dbpkg-chat/host-callers.json` and `packages/daemon/docs/caller-ledger.csv` still list the old Tovu path. The design regenerates them in B2.
- F1 to F4 are still pinned, not fixed (OD-6, OD-8).
- `measure-site-memory.mjs` was repointed but not executed (a 20 minute workload that needs a built server).

## One incident, no effect on the commits

While running the A6 mutations, a cleanup command killed the session's own shell twice and an orphaned mutation run left two mutated files in the working tree. The tree was restored with `git checkout`, checked clean, and all A6 specs were run again from the clean tree. Every commit was made from a gated tree; the A7 mutation specs each matched the committed text exactly once, which they could not if a mutation had been committed.

## For the next run

- B1 starts from `18618b08`. The files to carry to Jini are the 9 under `modules/run-finalizer/` minus `shared.ts`.
- In B1 the engine must call the Jini run-event owners with object arguments; the Tovu wrappers used here are positional (design 4.3). `now` becomes the `Clock` port, and the host defaults in `createAssistantRunFinalizer` (`randomUUID`, the child check, the agent table, the console, the unref'd timer) stay behind in `jini-run-finalizer.ts`.
- The mutation runner and its specs lived in the session scratchpad and are gone. The tables above name each mutation.
