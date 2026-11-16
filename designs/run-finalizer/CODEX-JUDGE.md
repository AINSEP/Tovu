Software Architect(Direct): **Verdict: needs rework.**

Reviewed the design and both pinned source refs without editing files. Findings below are based on source inspection; no tests, typechecks, or mutations were executed.

References:

- **D**: `designs/run-finalizer/DESIGN.md`, design ref.
- **F**: Tovu `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts`.
- **R**: Jini `packages/chat/src/server/durable-runs/recover.ts`.
- **L**: Jini `packages/chat/src/store/runtime/run-ledger.ts`.
- **S**: Jini `packages/chat/src/store/runtime/durable-run-store.ts`.

All source references use the requested `integ/wave-b-r2` refs.

1. **Blocker — B2 breaks the late-binding handoff before Phase C repairs it.**

   D:270–284 gives the Jini engine two internal cells updated through `useRecoveryDaemon` and `onAttemptEnded`. But D:449 keeps the shared wrapper until Phase C, and D:297 describes that wrapper as unchanged.

   The existing wrapper updates only `existing.options.recoveryDaemon` and `existing.options.onAttemptEnded` (F:801–802). That works because today’s engine reads that same object at call time (F:384,389,397,776). Mutating the wrapper’s object will not update the target engine’s internal cells.

   This can lose previous-daemon recovery and the attempt-ended hook during B2. C1/C2 should fail at that commit.

   **Fix:** In B2, retain the `WeakMap` if needed, but change its installer to invoke the engine’s setter methods. Initialize both values through those methods when constructing the binding. Do not defer that bridge to C-2.

2. **Major — The concurrency analysis misses launching an already-terminal successor.**

   D:327 claims safety through reloads, and D:362 describes the post-CAS reload as part of safe continuation. The actual check is weaker: R:204–208 verifies the new id and `cancelReason`, but never checks `next.message.runStatus` before R:209 launches it.

   A concrete interleaving is:

   - Recovery advances an attempt from recovery count 2 to 3 (S:395–417).
   - Before its post-CAS load, another browser recovery loads that new attempt.
   - A 404 reaches the recovery-limit check, which precedes launch grace (R:282–291), and settles it as failed.
   - The original recovery reloads that same id with no cancel reason, then launches it despite its terminal status.

   Its subsequent attachment is rejected by `watchable` (F:359–361), leaving execution without that watch.

   **Fix:** Add this interleaving to characterization and record it as another suspected defect. Resolve terminal-state validation before launch through an explicit behavior-fix decision; do not describe the existing reload as sufficient.

3. **Major — C6, C13, and C14 do not establish their claimed mutation sensitivity.**

   **C6, D:415:** The mutation at F:652 affects the **live 200** reconnect-reset branch. The stated assertion “at `maxReconnects` recover with trigger `timeout`” concerns uncertainty: F:683–685 explicitly refuses recovery for 200. That assertion cannot kill the reset mutation. Likewise, a stalled-stream deadline test follows F:624–634 and bypasses the `now() >= …` predicate at F:685.

   **C13, D:422:** Removing the reload in `decide` (R:239) need not change two dead-attempt recoveries. Both still encounter the reload at R:266–267 and the CAS at R:203/S:400–405. One launch and `continued`/`superseded` can remain unchanged.

   **C14, D:423:** A parallel implementation can start probes in message-id order, finish all stalled probes after one timeout, and keep routes gated until all finish. It satisfies the stated ordering and **at-most** `3 × timeout` assertions.

   **Fix:** Give each predicate its own controlled interleaving. For C13, race a live probe against settlement or generation change, where the `decide` reload uniquely matters. For C14, assert maximum concurrent probes equals one, or assert that probe two cannot start before probe one completes.

4. **Major — C11 conflates process death with caught exceptions and does not exercise its named guards.**

   D:426 simulates a crash by throwing and rejecting later port calls. Several such exceptions are deliberately caught:

   - cancellation failure: R:156,196;
   - launch failure: R:177–190, followed by attachment at R:210;
   - checkpoint failure: F:557–569.

   Throwing after launch can therefore create another watch in “dead” finalizer 1. Its scheduler, callbacks, logs, and cleanup remain executable. This differs materially from process death.

   The proposed mutations also lack matching schedules. Boot recovery passes **no** `expectedRunId` (F:705), so restarting after disabling finalizer 1 does not inherently test removal of that guard. Similarly, removing the terminal guard requires a checkpoint attempted **after settlement**; sequential crash/restart cases do not establish that overlap.

   **Fix:** Separate rejection tests from crash tests. Use process/worker termination or a harness that explicitly halts the old execution scope, including callbacks and timers. Specify a separate late-checkpoint race and a stale-watch recovery race for the two guards.

5. **Major — C5 and C15 cannot serve as the stated green migration contract.**

   **C5, D:414:** While an event stream remains open, `readWithinBound` already arms a scheduler timer through F:624–626 and F:410–419. A skipped checkpoint can therefore coexist with a scheduler entry. “One global timer and zero scheduler entries” is not the baseline state.

   **C15, D:424:** The seven exports are four erased interfaces plus three runtime functions, confirmed by TypeScript AST inspection. A runtime module cannot expose all seven names. A source-level assertion would instead need updates when A1 removes declarations and A7 deletes the module. The target finalizer also has seven methods (D:263–273), conflicting with the five-method assertion retained in later gates.

   **Fix:** C5 should assert the checkpoint frame adds no scheduler timer relative to the existing deadline timer, and separately verify `unref`. Define C15 as runtime exports, type-level contracts, and stage-specific public paths; list its updates in the relevant commits.

6. **Major — Replacing the published Jini implementation introduces unacknowledged behavior regressions.**

   The Jini copy cancels unusable response bodies in `packages/chat/src/server/run-finalizer/entry.ts:147–151`. Its boundary tests explicitly require cancellation for 404 and 503 bodies (`finalizer-boundaries.test.ts:61–77`).

   Tovu’s replacement returns immediately at F:583–584 without canceling either body.

   The Jini copy also contains reporter exceptions (`entry.ts:83–85`), with a test requiring settlement-error reporting to tolerate a throwing reporter (`finalizer.test.ts:143–156`). The target replaces that with a log port but specifies no equivalent containment; F:765’s corresponding reporting call can throw out of the catch.

   D:448 permits deleting old tests only when replacement tests cover the same statement. These behaviors are absent from the comparison inventory and conflict with simply porting Tovu unchanged.

   **Fix:** Reconcile both behavior baselines before B1. Preserve these guarantees or record explicit approved changes and their tests. OD-7’s API-break approval does not cover resource-cleanup or error-containment changes.

7. **Major — B1’s purity claim depends on an optional prerequisite.**

   D:448 permits B1 before R4/C6, while claiming the guard proves the engine imports only chat and core. The target’s `recovery-binding` imports `recover.ts` (D:219), which directly imports `@jini-ai/agent-runtime` at R:2. Its failure classification and startup-error formatting execute during recovery.

   This is existing debt, but the new engine’s executable dependency closure still includes that implementation. A passing debt-ratcheted guard does not prove the claimed isolation. It also prevents engine tests from being isolated solely through the listed ports.

   **Fix:** Require the C6 failure-port change before B1, or include the equivalent approved injection work in B1. Put the resulting agents/failure port in the finalizer’s actual contract and host binding, rather than leaving two conditional target shapes.

8. **Minor — New public contracts contradict the claimed argument convention.**

   D:503 says all new signatures follow `(required, optional = {})`. The proposed contracts include one-argument `RunTimerPort.schedule`, `RunLogPort.error/warn`, and the two installation methods (D:234,240–242,271–272).

   **Fix:** Add the optional object to new boundary contracts and implementations, or explicitly document the owner-approved scope of exceptions. Do not mark the practice satisfied as written.

9. **Minor — The stated durability and timing bounds are stronger than the implementation.**

   D:342 and D:350 bound lost progress to one checkpoint interval. That assumes successful, sufficiently fast storage. A pending write prevents another checkpoint (F:518), while repeated failures retain the old baseline and retry later (F:493–497,557–569). Checkpoint age can exceed multiple intervals.

   D:384 also describes launch/cancel as 10/5-second operations, but those signals start only at the HTTP send: readiness is awaited first (F:213), and cancellation awaits origin discovery first (F:225). Both await body cancellation afterward.

   **Fix:** State the assumptions behind the checkpoint-loss bound. Distinguish HTTP-request timeout from whole-operation duration, and characterize stalled readiness, origin lookup, and body cleanup where boundedness is required.

10. **Minor — The “no test today” claim overlooks an existing late-installation test.**

   D:19 says late option reads lack coverage. Tovu `apps/website/src/server/__tests__/assistant-chat-recovery.unit.test.ts:201–214` already creates the shared coordinator without a recovery daemon, installs one later, and asserts previous-daemon probing, streaming, and successful persistence.

   **Fix:** Reuse or extend that test for C1, and correct the coverage claim and characterization inventory.

**Inventory/classification sampling — 15 rows checked against source**

| Sample | Source evidence | Result |
|---|---|---|
| `RunDaemonRequest` | F:62–65 | Fields match |
| `RunDaemonClient` | F:68–77 | Five operations; optional operations match |
| Finalizer options | F:79–114 | 15 fields |
| Finalizer interface | F:116–129 | Five current methods |
| `daemonHeaders` | F:131–135 | Principal, Accept, optional bearer |
| HTTP factory | F:142–259 | Host lifecycle dependencies |
| `Watch` | F:264–297 | 22 fields |
| Eight module helpers | F:299–362 | Declarations present |
| `StreamResult` | F:364 | Four variants |
| Engine factory | F:370–784 | Present; inventory’s end line is loose |
| Shared coordinator | F:788–809 | One module `WeakMap`; two late installers |
| R3 checkpoint responsibility | F:481–571 | Pending write, trailing timer, backoff, receipt |
| R4 stream responsibility | F:575–609 | Replay/base/carry/terminal handling |
| R9 recovery binding | F:379–408 | Client selection and `newAttempts` ownership |
| Jini copy size | Jini finalizer `entry.ts:226`, `ports.ts:22` | 248 lines combined |

**Phase 0 mutation assessment**

“Plausible” below means supported by inspection, not executed.

| Test | Assessment |
|---|---|
| C1 | Plausible; substantially covered already |
| C2 | Plausible with a watch ending after late installation |
| C3 | Plausible if construction-time invocation is asserted before requests |
| C4 | Plausible if both watches enter recovery and the getter can change value |
| C5 | Baseline assertion needs correction — finding 5 |
| C6 | Claimed mutations target different branches — finding 3 |
| C7 | Plausible; bound the failure case so leaked activity fails promptly |
| C8 | Plausible with the successor held active through old cleanup |
| C9 | Plausible for client selection; does not itself prove duplicate side effects |
| C10 | Plausible with a one-shot settlement rejection |
| C11 | Crash model and mutation schedules insufficient — finding 4 |
| C12 | Plausible with an eligible, retryable run beyond launch grace |
| C13 | Named mutant can survive — finding 3 |
| C14 | Parallel-loop mutant can survive — finding 3 |
| C15 | Runtime/type and migration contradictions — finding 5 |

**F1–F3:** All three suspicions are supported by source inspection. F1’s unconditional deletion at F:770 can change client selection while a successor remains active. F2 follows from storage rejection escaping F:442/456 into watch cleanup. F3 follows from missing end evidence and recovery treating an eligible missing attempt as continuable. F3’s outcome remains conditional on exclusions, diagnostics, budgets, pending answers, and launch grace. None was runtime-reproduced here.

I could not verify numerical complexity limits, execution estimates, or green intermediate commits from this read-only review.

## Recurring mistake classes

- When redundant guards exist, test each guard at an outcome it uniquely protects; a generic concurrency test may correctly survive its removal.
- Model process death separately from promise rejection. Caught exceptions leave timers, callbacks, and execution scopes alive.
- Replacing an unused published implementation requires reconciling both behavior baselines, including cleanup and diagnostic-failure containment.
- Treat durable state transition and external launch as separate concurrency boundaries: a successful CAS does not authorize launching a row that has since become terminal.
