# Assistant run finalizer: split, one owner, host-bound ports (hard item #4)

Planning only. Nothing here was executed. Date 2026-11-16.
Revision 2 (2026-11-16): answers the Codex gpt-6.1-sol HIGH judgment in `CODEX-JUDGE.md`. All 10 findings were checked against the code and accepted; the last section lists what changed for each. OD-1 is decided by the owner: the engine moves to Jini.
Code read: Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `integ/wave-b-r2` @ `02edbb68`.
Personas: software-architect (lead), refactor, programmer, tdd. Skills: implementation-guardrails, refactor-patterns, architecture-migration, hexagonal-architecture, testable-design-patterns, test-design.

Short names used below:
- **the file** = `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts` (Tovu).
- **the Jini copy** = `packages/chat/src/server/run-finalizer/{entry.ts,ports.ts}` (Jini).
- **recovery** = `createDurableRecovery` in Jini `packages/chat/src/server/durable-runs/recover.ts`.
- **ledger** = `ChatRunLedger` (Jini `packages/chat/src/core/durable-runs/ledger-contracts.ts`, built by `store/runtime/run-ledger.ts`).

## 0. Summary

1. The file is 809 lines and has 7 exports and one module-level `WeakMap`. It holds three different things: a daemon HTTP adapter (Tovu-only), a watch engine that follows a run and saves it (generic), and a per-ledger singleton (composition).
2. **Jini already has a finalizer** at `@jini-ai/chat/server/run-finalizer` (226 + 22 lines, 26 tests). It is an older fork of the same engine. Nothing imports it: not Tovu, not any Jini package or example. It lacks recovery, attempt bases, bounded resolution, size-based checkpoint cadence and checkpoint backoff. So there are two owners today, and the published one is the stale one.
3. The split (OD-1, decided): the watch engine goes to Jini and **replaces** the Jini copy at the same path. The copy's 26 tests are reconciled one by one; two guarantees it has and the file lacks are kept (§4.4). Tovu keeps the HTTP adapter, the bindings (notices, run-id prefixes, `ps` child check, agent table, tracker, console) and the boot gating. The per-ledger `WeakMap` becomes an instance the composition root owns.
4. The work is four phases. Phase 0 adds characterization tests. Phase X is one red-first behaviour fix (cancel unusable response bodies). Phase A splits the file inside Tovu along the generic/host line (7 commits, each green alone). Phase B moves the engine files to Jini; it is blocked until untangle C6 and R4-chat have removed the `@jini-ai/agent-runtime` import from `recover.ts`. Phase C replaces the `WeakMap`. Phases 0, X and A stand on their own.
5. Three behaviours are easy to break silently: options read late after construction (§2.3), two eager snapshots at construction (§2.3), and the split between ref'd scheduler timers and the unref'd global checkpoint timer (§2.4). The late read of `recoveryDaemon` has a test today (`assistant-chat-recovery.unit.test.ts:201-214`); the late read of `onAttemptEnded`, the snapshots and the timer split do not.
6. Five suspected defects were found while tracing (§6). Four are pinned by tests in Phase 0 and are not fixed by this refactor. The fifth (unusable response bodies are not cancelled) is fixed in Phase X because the Jini copy's tests require it. The engine keeps no late-bound state: the two values a host installs late arrive as function ports (§4.1, §4.2).
7. Estimate: about 1.85M Sonnet tokens and 130k Opus review (§9).

## 1. Verified inventory

### 1.1 The file (Tovu `65302ee5`)

| Lines | Declaration | Kind | Responsibility |
|---|---|---|---|
| 62-66 | `RunDaemonRequest` | export type | `{ runId, principalId }`; owner comes from storage |
| 68-77 | `RunDaemonClient` | export port | `openEvents`, `runStatus`, optional `launch`, `cancel`, `release` |
| 79-114 | `AssistantRunFinalizerOptions` | export type | 15 fields: `ledger`, `onAttemptEnded`, `daemon`, `recoveryDaemon`, `now`, 4 timing values, `scheduler`, `checkpointIntervalMs`, `observability`, `tracker`, `verifyChildDead`, `supportsNativeResume` |
| 116-129 | `AssistantRunFinalizer` | export type | `recover`, `reconcileInterrupted`, `watch`, `idle`, `activeCount` |
| 131-135 | `daemonHeaders` | function | principal header, `Accept`, bearer token |
| 142-259 | `createHttpRunDaemonClient` | export factory | daemon HTTP adapter (see 1.2 R1) |
| 261, 264-297 | `CheckpointState`, `Watch` | types | per-run mutable record, 22 fields |
| 299-362 | `recoverySettings`, `approximateJsonBytes`, `checkpointDelay`, `checkpointGrew`, `hasUnsavedCheckpointGrowth`, `clearTrailing`, `stopWatch`, `watchable` | 8 module functions | pure helpers and watch stop |
| 364 | `StreamResult` | type | `ended` / `gone` / `dropped` / `unresolved` |
| 370-786 | `createAssistantRunFinalizer` | export factory | watch engine; 19 inner functions, the recovery port object and the 5-method result |
| 788-809 | `SharedFinalizer`, `sharedFinalizers`, `assistantRunFinalizerFor` | module state + export | one coordinator per ledger; late option install |

Recorded debt for this path: `development/scripts/size-debt.json` has 3 entries (`createHttpRunDaemonClient#1` 101 lines, `createAssistantRunFinalizer#1` 325 lines, `<file>` 580 counted lines). `development/scripts/src-complexity-debt.json` has 1 entry (`startWatch` cleanup callback, cyclomatic 11, line 768). Both files key debt by path, so a move must re-key or remove the entries in the same commit.

Imports of the file: 4 Tovu lifecycle modules (`assistant-daemon-connection`, `daemon-supervisor`, `daemon-demand-fetch`, `agent-daemon-port`), `#src/server/inbound/assistant/attempt-process-identity`, `#src/assistant/index`, `#src/assistant/agent-session-preset`, `#src/contracts/core/assistant-run-events`, `#src/contracts/core/model-facing-tool-errors`, and Jini `@jini-ai/chat/core`, `@jini-ai/chat/server/durable-runs`, `@jini-ai/diagnostics/observability`, `@jini-ai/sidecar`, `@jini-ai/sidecar/supervisor`, `@jini-ai/sidecar/supervisor/node`, `node:crypto`.

### 1.2 Responsibilities

| Id | Responsibility | Lines | Generic or host |
|---|---|---|---|
| R1 | **Daemon HTTP adapter.** URL and token, previous-vs-current daemon origin, per-run pin of endpoint and capability, `launch` (readiness, park recovery, `idempotencyKey = runId`, 10 s), `cancel` (`recovery-fence`, 5 s), `openEvents`, `runStatus` with the two-daemon probe | 131-259 | host |
| R2 | **Watch state.** `Watch`, `makeWatch`, `stopWatch`, `watchable`, `interruptionEvents` | 264-297, 345-362, 470-476, 731-755 | generic |
| R3 | **Checkpoint (persist while running).** Growth test, size-based cadence, one pending write, trailing timer, backed-off retry, delta receipt (`expected`/`previous`/`onPersisted`) | 309-343, 481-571 | generic |
| R4 | **Stream.** Replay from event 0 over `attemptBase`, retained events, frame carry, failed flag, terminal status | 575-609 | generic |
| R5 | **Bounded resolution.** `withinDeadline`, `probe`, `readWithinBound`, `retainLiveWatch`, `prepareReconnect`, `shouldRecover` | 410-433, 611-687 | generic |
| R6 | **Follow loop.** `follow`, `resolveStreamOutcome` | 661-697 | generic |
| R7 | **Finalize.** `settle` (terminal write); the no-recovery `canceled` arm of `recoverWatch` | 440-451, 457-462 | generic |
| R8 | **Hand-off to recovery.** Last checkpoint, delay, `recovery.recover` | 453-468 | generic |
| R9 | **Recovery port binding.** HTTP status to `live`/`dead`/`uncertain`, `attach` to `watch`, `launch` plus `newAttempts`, client choice for probe/attach/cancel | 379-408 | generic |
| R10 | **Reconcile after crash.** `reconcileInterrupted` passes a `recover(boot)` callback to the ledger | 700-711 | generic call, host gating |
| R11 | **Registry and cleanup.** `active` map, dedupe, `idle`, `activeCount`, tracker span, pin release, `onAttemptEnded` | 377, 712-729, 757-785 | generic |
| R12 | **Shared instance.** One coordinator per ledger, late install of `recoveryDaemon` and `onAttemptEnded` | 788-809 | composition |

Resume and cancel are not implemented in the file. Resume is recovery's `continueDead` (native resume or reconstruction). Cancel is: the caller writes `store.cancel({ runId, reason })`, then calls `finalizer.recover({ trigger: "browser" })`; recovery sees the cancel reason and finalizes as `canceled`.

Terminal writes have four writers today. All go through the ledger's guard except the last:
1. `settle` in the file (stream ended).
2. `recoverWatch` no-recovery arm in the file.
3. recovery `finalize` in Jini (`ports.settle`).
4. Jini `run-ledger.ts` `reconcileInterrupted`: its own locked `UPDATE` for rows that cannot be adopted.

### 1.3 Consumers (every reference, by `rg` over `*.ts,tsx,js,mjs,cjs,json,yml`)

24 files name the path or a symbol, the file itself included.

**Production (4):**

| File | Line | Use |
|---|---|---|
| `composition/app.ts` | 10, 2032 | `assistantRunFinalizerFor(...)` in `registerSiteIdlePark`, for `activeCount()` |
| `composition/modules/assistant.ts` | 84, 178, 179, 268, 284 | per request: shared finalizer for `watch` (186) and `recover` (269, 285); a new `createHttpRunDaemonClient` per accepted run, used only for `launch` (179-185) |
| `composition/modules/assistant-chats.ts` | 35, 88, 95-102, 114, 204, 277 | builds the shared finalizer with `recoveryDaemon` when serving; `reconcileInterrupted` at route registration; `recover` on conversation delete; `watch` on message save with `attemptBase` |
| `composition/modules/assistant-byok.ts` | 97, 590-594 | installs `onAttemptEnded` (rechecks site tool runs) when a durable store exists |

**Tests (15 files, 109 `it`/`test` call sites, runner `node:test`):**
`server/__tests__/`: `assistant-run-finalizer.test.ts` (11), `.restart.test.ts` (8), `.observability.test.ts` (15), `.checkpoint-backoff.unit.test.ts` (16), `assistant-durable-finalizer.unit.test.ts` (2), `assistant-chat-recovery.unit.test.ts` (9), `assistant-chat-recovery-bounds.unit.test.ts` (7), `assistant-launch-cause.unit.test.ts` (1), `assistant-checkpoint-route.unit.test.ts` (3), `assistant-chats-skill-title.unit.test.ts` (3).
`composition/modules/__tests__/`: `assistant-run-finalizer.failed-run.integration.test.ts` (1), `.http-client.unit.test.ts` (12), `.reconnect-pin.test.ts` (8).
Others: `runtime/lifecycle/__tests__/assistant-daemon-connection.test.ts` (12, uses `createHttpRunDaemonClient`), `development/scripts/__tests__/desktop-assistant-admission.integration.test.ts` (1, uses `assistantRunFinalizerFor`).
None uses `vi.mock` or module mocks of the file. None reads the file's source text.

**Tools and records:**
- `development/scripts/measure-site-memory.mjs:649` builds a module URL from the path string and imports `createAssistantRunFinalizer`. A move breaks it without a type error.
- `development/scripts/extraction-dossier.mjs:1748,1786`: comments naming the path.
- `development/scripts/size-debt.json`, `src-complexity-debt.json`: 1.1.
- Jini `packages/chat/dbpkg-chat/host-callers.json` and `packages/daemon/docs/caller-ledger.csv` list the Tovu path. They are generated ledgers; regenerate or edit them in the move commit.
- The file is **not** in `move-templates/CLASSIFY-files.tsv` (that sheet has 5 rows under `composition/modules/`, none for this file). No earlier plan classified it.

### 1.4 The Jini copy (Jini `02edbb68`)

`entry.ts` 226 lines, `ports.ts` 22 lines, tests `finalizer.test.ts` (14) and `finalizer-boundaries.test.ts` (12), runner vitest. Published as `@jini-ai/chat/server/run-finalizer` (`packages/chat/package.json:30,140,314`), listed in `knip.json:223` and `scripts/size-debt.json:591` (function 132 lines). Importers outside its own tests: none found in `packages/`, `examples/`, `scripts/` or in Tovu.

| Behaviour | Jini copy | The file |
|---|---|---|
| Hand-off to recovery | none; 404 settles `canceled`; exhaustion returns | `recovery.recover` with trigger |
| `attemptBase` and retained events | none; each replay starts from `[]` | both |
| Checkpoint growth rule | event count | `checkpointProgress` (text, extension events, tool ids) |
| Cadence | fixed 1 s | 1 / 3 / 10 s by saved size |
| Failed checkpoint | reruns at once from `finally` | backed-off retry, never under 1 s |
| Delta receipt | none | `expected` / `previous` / `onPersisted` |
| Deadline, probe timeout, stream abort | none | all three |
| Pin release, `onAttemptEnded`, tracker span | none | all three |
| Unusable events response (404, non-OK) | body cancelled (`entry.ts:147-151`) | body left open (583-584) |
| Reporter that throws | contained (`entry.ts:83-85`) | not applicable: the reporter is `console` |
| Events 404 | settles `canceled` at once | probes the owning daemon first (667-672) |
| Port call shape | one `args` object; `idle(args: Record<string, never>)` | `(required, optional)` |
| Scheduler port | `schedule` returns handle, `cancel({handle})`, `sleep` | `schedule({delayMs, run})` returns cancel |

The Jini copy cannot serve Tovu as it is, and the file's engine cannot stay next to it without being a second owner of the same behaviour. The first two extra rows are guarantees the copy has and the file lacks; §4.4 keeps them. Every other row is a place where the file's behaviour replaces the copy's (differences D1 to D7 in §7, Phase B).

### 1.5 Other Jini owners checked (reuse, no new parallel owner)

| Behaviour | Owner | Used by the file today |
|---|---|---|
| Recovery decision, budget, continuation launch | `chat/server/durable-runs/recover.ts` (319 lines) | yes, `createDurableRecovery` |
| Acceptance | `chat/server/durable-runs/accept.ts` | by `assistant.ts` through Tovu's 7-line wrapper |
| Continuation request | `chat/core/durable-runs/continuation.ts` | inside recovery |
| Guarded `settle`/`checkpoint`, boot discovery | `chat/store/runtime/run-ledger.ts` (351) | yes, through Tovu's 28-line wrapper |
| Attempt CAS, cancel, session capture | `chat/store/runtime/durable-run-store.ts` (530) | through `ledger.durable` |
| Checkpoint cadence and progress | `chat/core/checkpoint-interval.ts` | yes |
| Frame parsing, content, save compaction | `chat/core/run-events` | yes, through Tovu's wrapper |
| Browser-side follow | `chat/core/assistant-client/durable-run-subscription.ts` | no (different side) |
| Daemon-side continuation journal, session coordination | `daemon/src/continuation/*`, `daemon/session-coordination` | no (daemon process, not the API) |
| Outbox | `cms/core/kernel-outbox.ts`, `commerce/payments/ingest/outbox-relay.ts` | no; neither is a run outbox |

No new owner is needed. The only missing piece in Jini is the engine itself, and its slot exists.

## 2. Dependency graph inside the file (what the split must respect)

### 2.1 Call graph of the engine

```
watch() -> makeWatch -> startWatch -> tracker.trace(follow)
follow -> readWithinBound -> readStream -> applyStreamFrame -> checkpoint
       -> resolveStreamOutcome -> settle | recoverWatch
       -> probe -> shouldRecover -> recoverWatch
       -> prepareReconnect -> retainLiveWatch -> recovery.recover
recoverWatch -> ledger.checkpoint -> delay -> recovery.recover
recovery ports: probe -> probe(); attach -> finalizer.watch(); launch -> daemon.launch
checkpoint -> scheduleCheckpoint -> (timer) -> checkpoint ; retryCheckpoint -> scheduleCheckpoint
```

There is one cycle: `watch -> follow -> recoverWatch -> recovery.recover -> ports.attach -> finalizer.watch`. It closes through `const finalizer` (line 698), which the `attach` closure (line 388) reads when called, never during construction.

### 2.2 Mutable state and its owner

| State | Declared | Written by | Read by | Target owner |
|---|---|---|---|---|
| `active: Map<runId, {watch, done}>` | 377 | `startWatch` (set), its `finally` (delete if still this watch) | `watch` dedupe, `idle`, `activeCount`, cleanup (successor check) | registry (`entry.ts`) |
| `newAttempts: Set<runId>` | 379 | recovery `launch` (add), `startWatch` `finally` (delete) | recovery `probe`, `attach`, `cancelAttempt` | recovery binding; the registry calls `attemptEnded({ runId })` |
| `Watch` fields | 264 | stream (`events`, `retainedEvents`, `frameCarry`, `failed`, `terminal`), checkpointer (7 `checkpoint*` fields, `trailing`, `checkpointState`), bounded follow (`resolutionDeadline`), `stopWatch` (`terminal`, abort) | all engine slices | one record per watch, passed explicitly |
| `options.recoveryDaemon`, `options.onAttemptEnded` | caller's object | `assistantRunFinalizerFor` (801-802), **after** construction | 384, 389, 397, 776, at call time | function ports the engine calls at every use (§4.1); the values stay in the host: the `options` object until Phase C, two cells in `jini-run-finalizer.ts` after (§4.2) |
| `replayOrigins: Map` | 170 | `retainLiveOrigin`, `release`, `replayOrigin`, `runStatus` | `replayOrigin` | HTTP adapter (Tovu) |
| `previous` promise, `initialToken` | 157-158 | once, at client construction | `origin()` | HTTP adapter (Tovu) |
| `sharedFinalizers: WeakMap` | 794 | `assistantRunFinalizerFor` | same | removed in Phase C |

### 2.3 Late reads and eager reads (each one breaks silently if its timing changes)

| # | Read | Timing today | What breaks if changed |
|---|---|---|---|
| L1 | `options.recoveryDaemon` (384, 389, 397) | at every probe/attach/cancel | Serving composition installs it on a finalizer an earlier caller created. In `createApp` the order is `registerSiteIdlePark` (`app.ts:2049`, when `stopForIdle` is set), then `assistant-byok.ts:590` (`app.ts:2355`), then `assistant-chats.ts:95` (`app.ts:2385`). Destructuring `options` at construction makes boot recovery probe the new daemon only, and a live run on the previous daemon reads as dead. |
| L2 | `options.onAttemptEnded` (776) | at every watch end | Same pattern: with `stopForIdle`, `registerSiteIdlePark` creates the finalizer before the byok module installs the handler. Read eagerly, site tool runs are never rechecked. |
| L3 | `finalizer` inside `attach` (388) | at call | TDZ error if a slice calls `attach` during construction. |
| E1 | `options.ledger.durable` (378) | once, at construction | `createInMemoryChatHistory().chatRunLedger.durable` is a getter that opens the database (`store-factory.ts:52`). Reading it later or per call changes when the test database opens, and a `durable` that appears later is ignored today. |
| E2 | `optional.previousDaemon?.()` (158) | once, at client construction | It must snapshot the prior registry before the replacement daemon publishes (comment at 146-147). A lazy read can see the new record. |
| E3 | `assistantDaemonToken({}, {})` as `initialToken` (157) | once, at client construction | The prior daemon's fallback token. |
| E4 | `options.daemon ?? createHttpRunDaemonClient({ observability })` (373) | at construction, even when `daemon` is never used | Constructing the default client triggers E2/E3. |

The first caller's `tracker` and `observability` also win for the life of the process, because later `assistantRunFinalizerFor` calls only copy `recoveryDaemon` and `onAttemptEnded`.

### 2.4 Time sources (four, not one)

| Source | Where | Injected | Keeps the process alive |
|---|---|---|---|
| `options.now ?? Date.now` | all deadline arithmetic; passed to recovery | yes | n/a |
| `options.scheduler ?? createNodeSupervisorScheduler({})` | `withinDeadline`, `delay` | yes | yes (`supervisor-node.ts:180` does not `unref`) |
| global `setTimeout(...).unref()` | checkpoint trailing timer (483-487) | no | no |
| `AbortSignal.timeout(5_000 / 10_000 / 5_000)` | `statusAt` fallback (198), `launch` (218), `cancel` (228) | no | real clock only |

While an events stream is open, one `scheduler` timer is always armed for the resolution deadline (624-626 through 410-419). So "no scheduler entries" is never the state of a live watch; a test of the trailing checkpoint timer must compare against that existing entry (C5a).

Existing tests depend on this split: 6 files inject `scheduler`, and `assistant-run-finalizer.checkpoint-backoff.unit.test.ts` mocks global timers so trailing checkpoints never fire. A design that routes the trailing timer through `scheduler` changes both the tests and the idle-exit behaviour of the site process.

## 3. Generic vs host

**Generic, belongs in Jini `@jini-ai/chat/server/run-finalizer`:** R2 to R11. The engine knows a daemon only as a port, a ledger only as a port, and has no Tovu name, path, header, env var or copy except one English notice already duplicated in Jini (`"Stopped. Saved work is above."`: `recover.ts:12`, `run-ledger.ts` in `reconcileInterrupted`, and the file at 461).

**Host, stays in Tovu:**
- R1, the HTTP adapter. It imports five Tovu lifecycle modules and knows the principal header, the daemon registry file and park recovery.
- Bindings: `RUN_NOTICES` and the `byok:`/`agui:` prefixes (`contracts/core/assistant-run-events.ts`), `verifyAttemptChildDead` (`ps`), `agentCarriesOwnMemory` (agent table), `randomUUID`, the Node timers, the tracker, the console.
- Gating: only the serving composition calls `reconcileInterrupted` (`recoverInterrupted` option); export apps never do.
- Authorization: `ownedDurableRun` before `recover` (`assistant.ts:266,278`), the tenant-scoped store before `watch` (`assistant-chats.ts:277`).
- R12, as an instance owned by the composition root.

**Check against rule B1** (a Jini package imports only itself, core and protocol): the engine may import `chat/core/*`, `chat/server/durable-runs/*` and `@jini-ai/core/primitives` (`Clock`, already imported by the Jini copy). It may not import `@jini-ai/diagnostics` or `@jini-ai/sidecar`. So the tracker and the scheduler arrive as ports the chat package declares locally (B4: one consumer, declared in the consumer's `ports.ts`). The rule must hold for what the engine executes, not only for what its folder imports: `recover.ts:2` imports `@jini-ai/agent-runtime` today, so the move waits for untangle C6 and R4-chat (§4.1, §8).

## 4. Target shape

### 4.1 Jini (after Phase B)

```
packages/chat/src/server/run-finalizer/
  ports.ts             RunDaemonClient, RunDaemonRequest, RunTimerPort, RunSpanPort, RunLogPort,
                       RunFinalizerPorts, RunFinalizerOptions, RunFinalizer          (types only, ~120)
  watch-state.ts       Watch, makeWatch, stopWatch, watchable, interruptionEvents             (~110)
  checkpoint-policy.ts approximateJsonBytes, checkpointGrew, hasUnsavedCheckpointGrowth       (~50, pure)
  report.ts            reportSafely(required, optional = {}): calls a log or span port and contains
                       a throw from it (4.4)                                                  (~25)
  checkpointer.ts      createCheckpointer(required, optional = {}) -> { onFrame, clear }      (~150)
  stream.ts            createStreamReader(required, optional = {}) -> { read }                (~80)
  bounded-follow.ts    createFollower(required, optional = {}) -> { follow }                  (~190)
  recovery-binding.ts  createRecoveryBinding(required, optional = {}) -> { recovery, attemptEnded } (~85)
  entry.ts             createRunFinalizer(ports, options = {}) -> RunFinalizer                (~140)
  __tests__/           ported engine tests (7, Phase B)
packages/chat/src/testing/ (existing `@jini-ai/chat/testing` entry)
  run-finalizer-fakes.ts  fakeRunDaemon, manualRunTimers, recordingRunLedger (fakes of the ports)
```

Dependency direction: `entry -> recovery-binding, bounded-follow, checkpointer, stream, watch-state -> checkpoint-policy, report, ports`. Nothing in the folder imports `entry.ts`. `recovery-binding.ts` imports `../durable-runs/recover.js`.

**Import closure (judge finding 7).** The folder's own imports are chat and `@jini-ai/core/primitives`. That is not enough: `recover.ts:2` imports `classifyAgentServiceFailure` and `startupFailureMessage` from `@jini-ai/agent-runtime`, and the engine executes that code on every dead-attempt decision. So B1 has a hard prerequisite: untangle C6 (creates `packages/chat/src/core/agents-port.ts` with `ChatAgentFailurePort`, sheet `untangle/sheets/C6.md` §5) and lane R4-chat row 390 of `LANES-files.tsv` (removes the import from `recover.ts`; `RecoveryPorts` gains `agents`). There is one target shape, not two: the finalizer contract carries `agents`, and the host binds it.

Signatures. New port methods take `(required, optional?: {})`. Exceptions are listed in 11, practice 2.

```ts
// ports.ts
export interface RunDaemonRequest { readonly runId: string; readonly principalId: string }
export interface RunDaemonClient {                       // unchanged from the file, lines 68-77,
  openEvents(required: RunDaemonRequest, optional?: { signal?: AbortSignal }): Promise<Response>;
  runStatus(required: RunDaemonRequest, optional?: { signal?: AbortSignal }): Promise<number | null>;
  launch?(required: { run: DurableRun; request: AcceptedRunRequest }, optional: {}): Promise<void>;
  cancel?(required: RunDaemonRequest, optional: {}): Promise<void>;
  release?(required: RunDaemonRequest, optional?: {}): void;   // was `Record<string, never>` (practice 2)
}
/** Same required keys as sidecar's SupervisorScheduler.schedule (supervisor.ts:23), restated here (B4).
 *  A one-parameter implementation is assignable, so Tovu passes its scheduler object as is. */
export interface RunTimerPort { schedule(required: { delayMs: number; run: () => void }, optional?: {}): () => void }
export interface RunSpanPort {
  trace<T>(required: { name: string; run: (span: { setOutcome(outcome: { status: RunWatchOutcome; error?: unknown }): void }) => T | Promise<T> },
           optional: { agent: { runId: string; conversationId: string } }): Promise<T>;
}
export type RunWatchOutcome = "succeeded" | "failed" | "canceled" | "interrupted" | "abandoned";
export interface RunLogPort {
  error(required: { operation: "checkpoint" | "watch"; runId: string; error: unknown }, optional?: {}): void;
  warn(required: { operation: "attempt-cleanup"; runId: string; error: unknown }, optional?: {}): void;
}
export interface RunFinalizerPorts {
  readonly ledger: Pick<ChatRunLedger, "durable" | "settle" | "checkpoint" | "reconcileInterrupted">;
  readonly daemon: RunDaemonClient;
  /** Client that holds an adopted run (one this engine did not launch). Called at every probe,
   *  attach and cancel of such a run and never cached: a host may install it after construction (L1). */
  recoveryDaemon(required: { runId: string }, optional?: {}): RunDaemonClient | undefined;
  /** Called at every watch end, after `release` (L2). A host without the hook passes a no-op. */
  onAttemptEnded(required: { runId: string }, optional?: {}): Promise<void>;
  readonly clock: Clock;                       // @jini-ai/core/primitives
  readonly timers: RunTimerPort;               // deadlines and reconnect delays
  readonly checkpointTimers: RunTimerPort;     // trailing checkpoint timer (host unrefs it)
  readonly span: RunSpanPort;
  readonly log: RunLogPort;
  readonly notices: RunNotices;                // chat/core/run-events
  readonly isDaemonRunId: RunIdPolicy;         // chat/core/durable-runs/ports
  readonly mintRunId: () => string;
  readonly agents: ChatAgentFailurePort;       // chat/core/agents-port.ts (untangle C6); passed to RecoveryPorts.agents
  readonly verifyChildDead: RecoveryPorts["verifyChildDead"];
  readonly supportsNativeResume: RecoveryPorts["supportsNativeResume"];
}
export interface RunFinalizerOptions {
  readonly reconnectDelayMs?: number; readonly maxReconnects?: number;
  readonly resolutionTimeoutMs?: number; readonly statusTimeoutMs?: number;
  readonly checkpointIntervalMs?: number;
}
export interface RunFinalizer {              // the same five methods as today (file lines 116-129)
  recover: DurableRecovery["recover"];
  reconcileInterrupted(required?: { now?: number }, optional?: {}): Promise<number>;
  watch(required: { principalId: string; conversationId: string; message: ChatMessage },
        optional?: { daemon?: RunDaemonClient; attemptBase?: AgentEvent[] }): void;
  idle(): Promise<void>;
  activeCount(): number;
}
```

**Change from the first version (judge finding 1).** The engine has no `useRecoveryDaemon` / `onAttemptEnded` setter methods and holds no late-bound cells. `recoveryDaemon` and `onAttemptEnded` are function ports the engine calls every time. Who mutates what, and when, is the host's business. This is what keeps the hand-off intact at every commit (4.2, B2).

Slice contracts (inputs, outputs, init point, who owns the state):

| Slice | Inputs | Outputs | Owns | Init point | Hand-off |
|---|---|---|---|---|---|
| `checkpointer` | `ledger.checkpoint`, `clock`, `checkpointTimers`, `log`, `checkpointIntervalMs?` | `onFrame(watch)`, `clear(watch)` | the 7 `checkpoint*` fields, `trailing`, `checkpointState` on the `Watch` it is given | built once in `entry.ts`; touches no port until the first frame | `stopWatch` calls `clear`; a late completion checks `watch.terminal` |
| `stream` | `notices` | `read(watch): Promise<StreamResult>` | `events`, `retainedEvents`, `frameCarry`, `failed`; sets `terminal` on an end frame; cancels an unusable body (X1) | built once | calls `checkpointer.onFrame` after each non-terminal frame |
| `bounded-follow` | `stream.read`, `clock`, `timers`, settings, `settle`, `recoverWatch`, `retainLive` | `follow(watch): Promise<RunWatchOutcome>` | `resolutionDeadline`, the reconnect counter | built once | returns the outcome to the registry's span |
| `recovery-binding` | `ledger`, `durable` (already read), `clock`, `mintRunId`, `agents`, both child ports, `daemon`, the `recoveryDaemon` port, `probe`, `attach` callback | `recovery?: DurableRecovery`, `attemptEnded({ runId })` | `newAttempts` | built once; `createDurableRecovery` runs here, only when `durable` exists | `attach` is a callback supplied by `entry.ts`; it is called only from `recover()` |
| `entry` | all ports | `RunFinalizer` | `active` | reads `ports.ledger.durable` exactly once, first statement (E1) | |

`recoveryDaemon` is called at use, so L1 stays a call-time read. `attach` is a closure over the returned object, so L3 stays a call-time read.

### 4.2 Tovu (after Phase B and C)

```
apps/website/src/server/runtime/composition/
  jini-run-finalizer.ts            createAssistantRunFinalizer(options, _optional = {}): binds Tovu ports,
                                   calls Jini createRunFinalizer. Name follows untangle DESIGN §3 (`jini-<topic>.ts`). (~95)
  modules/run-daemon-http-client.ts   createHttpRunDaemonClient(required, optional = {})          (~130)
  modules/run-daemon-origins.ts       createRunDaemonOrigins(required, optional = {}) ->
                                      { origin, replayOrigin, retainLive, release, forget, current } (~90)
  shared-run-finalizer.ts          assistantRunFinalizerFor, byte-identical to lines 786-809; deleted in Phase C (~25)
```

`jini-run-finalizer.ts` keeps today's option names (`now`, `scheduler`, `tracker`, `observability`, `daemon`, `recoveryDaemon`, `onAttemptEnded`, timing values) so the test files and the one script that construct a finalizer with fakes change one import line and nothing else. It is wiring, not a forwarder: it adds the notices, the prefix policy, `verifyAttemptChildDead`, `agentCarriesOwnMemory`, `chatAgentFailures`, `randomUUID`, the two timer ports, the span adapter and the console adapter.

**The late-binding hand-off, stated per phase (judge finding 1):**

| Phase | Who holds the two late values | Who writes them | Who reads them, when |
|---|---|---|---|
| today, Phase A | the `options` object stored in the `WeakMap` entry (805-807) | `assistantRunFinalizerFor` (801-802) | the engine, through `options.recoveryDaemon` / `options.onAttemptEnded` at call time |
| Phase B (B2) | the same `options` object | the same two lines, unchanged | the binding passes `recoveryDaemon: () => options.recoveryDaemon` and `onAttemptEnded: (required) => options.onAttemptEnded?.(required) ?? Promise.resolve()`; the engine calls the ports at every use |
| Phase C | two `let` cells inside `jini-run-finalizer.ts`, initialised from `options.recoveryDaemon` / `options.onAttemptEnded` | Tovu-only methods `useRecoveryDaemon(required, optional = {})` and `useAttemptEndedHandler(required, optional = {})` on the object Tovu returns | the same two port functions, now reading the cells |

Rule for the binding in B2: it must close over the `options` object it was given, by reference. It must not spread it, copy it, or destructure `recoveryDaemon` / `onAttemptEnded`. C1 and C2 go through `assistantRunFinalizerFor` and fail if it does. In Phase C the Tovu type is `AssistantRunFinalizer = RunFinalizer & { useRecoveryDaemon; useAttemptEndedHandler }`. The object is the engine's five methods plus two host methods that own host state; no engine method is wrapped.

### 4.3 Port bindings checked for behaviour, not only for types

| Port | Engine expects | Tovu supplies today | Binding | Difference to guard |
|---|---|---|---|---|
| clock | `Clock.nowMs()` | `now?: () => number` | `{ nowMs: options.now ?? Date.now }`; recovery gets `() => clock.nowMs()` | none; one read per call as today |
| `timers` | `schedule({ delayMs, run })` returns cancel | `SupervisorScheduler`, same keys | pass through; default `createNodeSupervisorScheduler({})` | ref'd timers; unchanged |
| `checkpointTimers` | same shape | global `setTimeout` + `unref()` | `{ schedule: ({ delayMs, run }) => { const t = setTimeout(run, delayMs); t.unref(); return () => clearTimeout(t); } }`, reading the global at call time | tests that mock global timers still intercept it; `scheduler` fakes still do not see it |
| `recoveryDaemon` | function, called at use | a field read late | `() => options.recoveryDaemon` (4.2) | the binding must hold `options` by reference |
| `onAttemptEnded` | function returning a promise | optional field read late, `await options.onAttemptEnded?.(...)` | 4.2 | when the field is unset the engine awaits a resolved promise instead of `undefined`; C7 pins the effect order, microtask timing is not asserted |
| `span` | one `trace` signature with `agent` options | `Tracker.trace` (3 overloads in `diagnostics/src/observability/tracker-types.ts`) | pass `tracker` if `tsc` accepts the overload against the single signature; otherwise `{ trace: (required, optional) => tracker.trace(required, optional) }` | **not verified with `tsc`**; decide at dispatch |
| `log` | `error(...)`, `warn(...)` | three `console` calls (558, 765, 778) | adapter that prints the same three strings, with `describeErrorForLog` on the cleanup warning only | text and arguments must stay byte-identical (test `failed credential release records only its error class and code`) |
| `notices` | `RunNotices` object | `RUN_NOTICES` bound inside Tovu wrappers | pass `RUN_NOTICES` | engine calls Jini `translateRunFrame({ kind, raw, notices }, { carry })`; Tovu's wrapper takes `{ kind, raw }` |
| run events | `runContentFromEvents({ events })`, `runEventsForSave({ events })`, `readSseFrames({ body })` | Tovu wrappers take a **positional** array / stream | engine calls the Jini owners directly | positional to object: every call in the moved code changes (11 calls on lines 447, 448, 456, 474, 531, 532, 591, 600) |
| `isDaemonRunId` | `({ runId }) => boolean` | Tovu wrapper binds `excludedPrefixes` | pass Tovu's `isDaemonRunId` | none |
| `daemon` | `RunDaemonClient` as in 4.1 | same type, moved | pass through | `release`'s optional type loosens from `Record<string, never>` to `{}`; no caller passes a value |
| `ledger` | `Pick<ChatRunLedger, 4 members>` | Tovu `ChatRunLedger` is the Jini type (`run-ledger.ts:10`) | pass `options.ledger` by reference | `durable` is a getter in tests; a spread in the binding plus the engine's read would read it twice and C4 fails |
| `agents` | `ChatAgentFailurePort` | nothing today; `recover.ts` imports the two helpers itself | `chatAgentFailures` from `composition/jini-agents.ts` (C6 sheet §6) | exists only after untangle C6 + R4-chat |
| child ports | recovery's signatures | `verifyAttemptChildDead(required, {})`, `agentCarriesOwnMemory({ agentId }, {})` | same lambdas as 404-405 | none |

### 4.4 Two guarantees taken from the Jini copy (judge finding 6)

The Jini copy is published and has tests that state two guarantees the file does not give. OD-1 replaces the copy, so both are kept, not dropped.

| Guarantee | Jini copy | The file today | In the target |
|---|---|---|---|
| An unusable events response has its body cancelled | `entry.ts:147-151`, tests `finalizer-boundaries.test.ts:61-93` (404, 503, a body whose `cancel` rejects) | `readStream` returns at 583-584 without cancelling. Checked in Node 22.23: a `Response` body that is neither read nor cancelled stays open. With 30 reconnects against a 503 this holds up to 30 bodies per run until GC. | Fix X1 (7, Phase X): cancel, ignore a rejected cancel. Red-first in Tovu before the split, so the moved code has it. |
| A throwing reporter does not change run behaviour | `entry.ts:83-85`, test `finalizer.test.ts:143-156` | not needed: the reporter is `console` | The target introduces `RunLogPort` and `RunSpanPort`. A host port can throw. Checked in Node 22.23: a throw from the log call inside the checkpoint `.catch` (557-560) skips `retryCheckpoint` and becomes an unhandled rejection of the `void checkpoint(watch)` promise; a throw at 765 escapes the catch and rejects `done`. So every log call and every `setOutcome` call goes through `reportSafely`, which contains the throw. Added in the commits that introduce the ports (A4, A7), each with a throwing-fake test. |

Conflict with practice 9 (errors never swallowed): `reportSafely` swallows exactly one thing, the reporter's own failure, because the reporter is the only place it could be reported. Flagged in 11.

## 5. Correctness

### 5.1 What makes each path safe today

| Property | Mechanism | Where |
|---|---|---|
| A terminal row is written once | `ledger.settle` takes the run lock and updates only a row with this `runId` that is not terminal | Jini `run-ledger.ts:245-278` |
| A late checkpoint cannot reopen a row | same lock and predicate in `ledger.checkpoint` (281-293), plus `watch.terminal` checked before a write starts (518) and before re-arming (567) | both |
| A stale attempt cannot write | recovery advances `run_id` by CAS (`store.advance`, `durable-run-store.ts:395-417`); every later write carries the old id | Jini |
| At most one new attempt id per decision | `expectedRunId` check (`recover.ts:300`), reload after awaits (239, 266), CAS (203) | Jini `recover.ts` |
| A replay cannot shrink the saved answer | `retainedEvents` and the growth rule | 470-476, 585, 524 |
| An end frame is never stuck behind a slow save | one pending checkpoint, never awaited by the frame loop | 607, 517 |
| A dropped stream is not a death | probe the owning daemon; only 404 is `dead`; anything else is `uncertain` | 382-386, 682-686 |
| A live quiet run is never killed by a timer | `readWithinBound` renews the deadline on a fresh 200 | 621-639 |
| Launch is idempotent | `idempotencyKey: run.runId` | 218 |

**Two boundaries, not one (judge finding 2).** The durable transition (CAS in `store.advance`) and the external launch (`ports.launch`, an HTTP call) are separate concurrency boundaries. Winning the CAS proves that this caller owns the new attempt id. It does not prove that the row is still launchable when the launch is sent, or while it is in flight. Today nothing checks that:

| Boundary | What is checked | What is not checked |
|---|---|---|
| Durable transition (`recover.ts:203`) | row has the old `run_id`, no cancel reason, status `queued`/`running`, under the run lock | nothing missing |
| Before launch (`recover.ts:204-208`) | row exists, has the new id, has no cancel reason | `runStatus`. A row that became terminal between 203 and 204 is launched |
| During launch (`recover.ts:209`, `launchNext` 171-193) | nothing | another `recover` for the new attempt can finalize the row while the launch request is in flight |
| After launch (`recover.ts:210`) | `watch` refuses a terminal message (`watchable`, 359-362) | the launched attempt keeps running on the daemon |

This is suspected defect F4 (6). The first version of this design said the reload after the CAS made continuation safe. That was wrong.

### 5.2 Crash at every step

"Crash" is the API process dying: no later line of that process runs, no timer fires, no callback is called. It is not a rejected promise. A rejection is handled by code that is still alive, and three of them are caught on purpose (5.3). The two cases get separate tests (C11-H and C11-R).

The daemon may survive a crash (it is detached). After a crash only boot repair acts: `assistant-chats.ts:114` calls `reconcileInterrupted`, which calls `recover({ trigger: "boot" })` per unfinished row, with no `expectedRunId` (705).

**Path S, stream end:** S1 end frame read, S2 `stopWatch`, S3 `ledger.settle`, S4 cleanup (release pin, `onAttemptEnded`, `active.delete`).

| Crash point | Left on disk | Repair |
|---|---|---|
| before S3 commits | row `running`, last successful checkpoint (age: see path K) | daemon alive and still has the run: 200, reattach, replay from 0, settle. Daemon gone: 404, treated as a dead attempt, **a new attempt is launched** although the run had finished (F3) |
| after S3 commits | terminal row | none needed; boot discovery selects only `queued`/`running` |

**Path K, checkpoint:** K1 compute, K2 mark pending and stamp time, K3 `ledger.checkpoint`, K4 update baselines on `true`, K5 clear pending and reschedule on growth.

| Crash point | Left on disk | Repair |
|---|---|---|
| before K3 commits | previous checkpoint | boot repair |
| after K3 commits | new checkpoint | same; in-memory baselines die with the process |

How old the saved checkpoint can be (judge finding 9). "At most one interval" holds only if each write succeeds and finishes inside one interval. The real bound has three parts:
- Only one write is pending per run (518). A write that takes T seconds blocks the next one for T seconds; later frames are coalesced.
- A rejected write keeps the old baseline and retries after `max(interval, 1 s)` (493-497). Each retry can fail again. There is no cap on the number of retries, so the age has no upper bound while storage keeps failing.
- A `false` result (fenced or unchanged row) is not retried; only new growth schedules another write (563-569).

So the loss at a crash is: everything since the last write that committed. It is one interval (1, 3 or 10 s by saved size) only with healthy storage.

**Path R, hand-off:** R1 choose events, R2 `stopWatch`, R3 full `ledger.checkpoint`, R4 delay `reconnectDelayMs`, R5 `recovery.recover({ expectedRunId })`.

| Crash point | Left on disk | Repair |
|---|---|---|
| before or after R3 | row `running` | boot repair |
| during R4 | row `running` | boot repair. (Without a crash: a browser `recover` or a new `watch` may run meanwhile; `expectedRunId` decides, C11-G1.) |

**Path D, continuation (Jini `continueDead`):** D1 cancel old attempt, D2 mint id, D3 `store.advance` CAS, D4 reload, D5 launch, D6 `recoveryClock`, D7 attach.

| Crash point | Left on disk | Repair |
|---|---|---|
| after D3, before D5 | new `run_id`, `queued`, nothing launched | boot: 404. Within 10 s of `attemptStartedAt` it waits and re-probes every `reconnectDelayMs`; after that it continues again and spends one more of the 3 recoveries. If this was the third recovery, `budgetNotice` runs before the grace check (`recover.ts:286-290`) and the row is finalized `failed` at once, with no wait |
| after D5, before D7 | daemon is running the new attempt | boot: 200, reattach |

**Path X, cancel:** X1 `store.cancel`, X2 `recover`, X3 cancel attempt on daemon, X4 settle `canceled`. A crash after X1 leaves a cancel reason on a `running` row; boot repair reaches X3 and X4 through the same exclusion check. Repeating X1 to X4 is safe.

**Path B, boot:** rows are handled one after another (`run-ledger.ts:308-309` awaits each `recover`), and chat routes wait for the whole pass (`assistant-chats.ts:128-130`). The cost per row is not 5 s as the first version said:
- probe: at most `statusTimeoutMs` (5 s), bounded by the engine (422-433);
- for a dead row older than the launch grace: plus `cancel` and `launch`, which the engine does not bound (5.5).

Recorded as a cost, not changed. C14 and C18 pin it.

### 5.3 Rejections (the process stays alive)

| Port call that rejects | Handled by | Result |
|---|---|---|
| `ledger.checkpoint` in the frame path (538) | `.catch` at 557 | logged; retry after `max(interval, 1 s)`; the stream goes on |
| `ledger.settle` (442) | nothing in `settle`; caught at 762 | watch ends `abandoned`, row stays `running`, nothing retries (F2) |
| `ledger.checkpoint` in `recoverWatch` (456) | same | same; `recovery.recover` never runs (F2) |
| `cancelAttempt` (`recover.ts:156`, `196`) | `.catch(() => undefined)` | ignored; the decision goes on (finalize, or CAS and launch) |
| `launch` or `recoveryClock` (`recover.ts:174-176`) | `catch` at 177 | diagnostic checkpoint `run_launch_unconfirmed`; **then `attach` at 210 starts a watch** for the same attempt |
| `openEvents` (577) | `.catch` at 622 | `dropped`; probe decides |
| `runStatus` (430) | `.catch(() => null)` | `uncertain` |
| `release` or `onAttemptEnded` (775-776) | `catch` at 778 | warning; `active` is still cleared (779) |

A test that "crashes" by throwing takes these branches. After a thrown launch, the "dead" finalizer starts a new watch with live timers. That is why C11 is split.

### 5.4 Concurrency with a live run

- A second `watch` for a run already watched is a no-op (716). A watch that has stopped but not yet cleaned up is replaced; the old cleanup deletes `active` only if the entry is still its own (779) and releases the pin only if no successor shares the client (775).
- A browser `recover` while a watch is live: 200 gives `reattached` and `attach` is the no-op above. A 404 advances the attempt; the old watch's later writes are rejected by the ledger, its own `recover({ expectedRunId })` returns `superseded`, and it ends.
- Two `recover` calls for one dead attempt: one wins the CAS, the other returns `superseded`. Three guards overlap here (the reload in `decide` at 239, the reload in `resolveMissing` at 266, the CAS). A test of this case cannot tell them apart, so each guard gets its own test at an outcome only it protects (C13a to C13d, C11-G1).
- A `recover` for an attempt that is being launched (F4): the new id is in `newAttempts` from line 393, so the probe goes to the current daemon. Until the daemon has registered the run it answers 404. For the first and second continuation the launch grace (`recover.ts:131-133`, 290) turns that into `waiting`. For the third, `budgetNotice` (286-287) comes first and the row is finalized `failed` while its launch is in flight.

### 5.5 Clock and timeouts

Defaults: reconnect delay 2 s, 30 reconnects, 120 s without live proof, 5 s per status probe, checkpoint 1/3/10 s, checkpoint retry at least 1 s. Recovery: 3 recoveries, 5 min window, 30 min staleness, 10 s launch grace.
- Deadlines are computed from `now()` and waited through the scheduler. A forward clock jump (laptop sleep) makes the deadline fire at once; the probe then decides, so a live run is renewed.
- While an events stream is open, one scheduler timer is always armed for the resolution deadline (`readWithinBound` 624-626 through `withinDeadline` 410-419). It is separate from the global trailing checkpoint timer.
- The HTTP timeouts are per request, not per operation (judge finding 9):

| Operation | Steps (file lines) | Bounded part | Not bounded here |
|---|---|---|---|
| `launch` (210-223) | `ensureReady` (213), park recovery around the send (214), POST (216-219), `response.body.cancel()` (222) | the POST: 10 s on the real clock | readiness (`ensureAssistantDaemonReady`, `daemon-supervisor.ts:763`), park-recovery retries, body cancel |
| `cancel` (224-231) | `replayOrigin` (225; awaits the previous-daemon registry read at 162), POST (226-229), body cancel (230) | the POST: 5 s | origin lookup, body cancel |
| status fallback (192-207) | GET with `signal ?? AbortSignal.timeout(5_000)` | 5 s; the engine also races it against `statusTimeoutMs` | nothing |

`AbortSignal.timeout` uses the real clock; a fake clock cannot advance it. These calls stay in the Tovu adapter. Whether readiness and origin lookup need a bound is a behaviour question for the HTTP adapter, not for this refactor; C18 pins today's behaviour.

## 6. Suspected defects found while tracing (pin, do not fix inside the refactor commits)

None was reproduced by running the product code. Each gets a Phase 0 test that records today's behaviour; a fix is a separate red-first change.

| Id | Suspicion | Trace |
|---|---|---|
| F1 | `newAttempts.delete(runId)` (770) runs in the old watch's cleanup even when a successor watch for the same run id is live. After that, `cancelAttempt` and `probe` for a new attempt choose `recoveryDaemon`. With a surviving previous daemon and no pinned origin, `cancel` goes to the previous daemon, which does not hold the attempt, so the fence is missed and a continuation can start while the attempt still runs. The ledger CAS still protects the saved row; tool side effects are not protected. | 384, 397, 770; client `cancel` at 224-231, `origin()` at 161-167 |
| F2 | A storage rejection in `settle` (442) or in `recoverWatch`'s checkpoint (456) ends the watch with the row still `running`. Nothing watches it again until a browser request or a restart. | 442, 456, 762-766 |
| F3 | A run that finished but was not yet settled when the API died is continued as a new attempt if the daemon is also gone, because a 404 is the only death signal and the saved events carry no end marker. | 5.2 path S |
| F4 | **New (judge finding 2, extended).** A continuation is launched for, or keeps running under, a row that is already terminal. Window W1: between the CAS (`recover.ts:203`) and the reload (204), another caller settles the new attempt; 207-208 check id and cancel reason only, so 209 launches, and `attach` is then refused by `watchable`: execution with no watch. The store is asynchronous (`kernel.transaction`, `lockKey`, Kysely), so W1 is real, and wider with a network database. Window W2: during the launch request. Any other `recover` of the third continuation sees 404 and finalizes `failed` before the grace check (5.4). The watch does attach (its copy of the message is not terminal), the run executes, and its final `ledger.settle` returns `false`. `finalize` also sends `cancel` first; if that reaches the daemon before the launch POST it gets 404 (ignored at 156) and the fence is missed. A check before launch closes W1 only. | `recover.ts:203-210`, 282-290; file 359-362, 393; `durable-run-store.ts:409` |
| F5 | **New (judge finding 6).** Unusable events responses are not cancelled (4.4). | 583-584 |

F5 is fixed in this plan (X1) because OD-1 replaces an implementation whose tests require the cancel. F1 to F4 are pinned only.

## 7. Migration

Commands (real ones; none was run in this session, no install was done):
- Tovu, one file: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks <file>` (from `package.json:39`). Gates: `npm run typecheck`, **`npm run typecheck:tests`** (`tsconfig.json:22-23` excludes test files, so `typecheck` alone does not check a repointed test import or the type contract of C15), `npm run check:size`, `npm run check:complexity`, `npm run check:boundaries`.
- Jini: `pnpm install && pnpm -r build` first (Tovu consumes `dist`), then `npm --prefix packages/chat run test`, `pnpm typecheck`, `pnpm guard`.

The finalizer test set for "green" in every Tovu step is the 15 files in 1.3. Test count rule (honest-testing): 109 call sites before; after Phase B the sum of Tovu and Jini call sites that came from these files is 109 plus the Phase 0 and Phase X additions. The 26 tests of the Jini copy are accounted for one by one in B1.

### Phase 0: characterization (Tovu, no production change)

New files under `apps/website/src/server/__tests__/`: `assistant-run-finalizer.characterization.unit.test.ts`, `...races.unit.test.ts`, `...halt-matrix.integration.test.ts`, `...rejections.unit.test.ts`. Prerequisite: none.

Fakes (all are fakes of port interfaces; no module is mocked): a `RunDaemonClient` object whose calls can be held and released one by one; a `SupervisorScheduler` object with manual firing; a `now` counter; `node:test` mock timers for the global timer (as `checkpoint-backoff.unit.test.ts:60` does); a wrapper around `ChatRunLedger` / `DurableRunStore` that can hold one named call before or after it reaches the real store; the real in-memory chat database (`openChatDb(":memory:")`, as `restart.test.ts:33`) where a ledger guard is the thing under test; `recoveryLedgerFixture` (`assistant-chat-recovery.unit.test.ts`) elsewhere.

Each row names one predicate and a schedule that reaches it. Where a row says "recover (`timeout`)", the trigger is observed through the no-recovery arm: `timeout` leaves the row unsettled and `stream` settles it `canceled` (457-461); the watch's span outcome is `interrupted` in both. "Kills" is the mutation the test must fail on; the dispatch must run each mutation once and paste the failing output (a mutation that survives means the test is wrong, not the code).

**Timing of reads and timers**

| Test | Schedule and assertion | Kills |
|---|---|---|
| C1 late `recoveryDaemon` | **Exists already:** `assistant-chat-recovery.unit.test.ts:201-214` ("serving composition adds prior-daemon recovery to the coordinator first created by an export app"). No new test. It is named in the gate of A6, A7, B2 and C-2. | `const { recoveryDaemon } = options` at construction; in B2, a binding that copies `options` |
| C2 late `onAttemptEnded` | Create through `assistantRunFinalizerFor` without the handler, install it with a second call, end a watch after that: the handler receives the run id. No test does this today (the one test with the hook passes it at construction, `failed-run.integration.test.ts:41`). | same mutation for `onAttemptEnded` |
| C3 `previousDaemon` snapshot | called exactly once before the constructor returns; never again across 3 requests | make the call lazy inside `origin()` |
| C4 `ledger.durable` read once | a counting getter reads 1 after construction and 1 after two watches; a ledger whose `durable` is `undefined` at construction never recovers | read `options.ledger.durable` inside `recoverWatch` |
| C5a trailing timer is global | Stream open, so the deadline timer is already armed: record `scheduler` entries = n (n is 1). Push a frame that saves, then a frame inside the interval. Assert: `scheduler` entries still n; pending global timers went from 0 to 1 | route `scheduleCheckpoint` through `scheduler` |
| C5b trailing timer is unref'd | wrap `globalThis.setTimeout` for the test so the returned handle counts `unref()` calls: exactly 1 for the trailing timer | delete line 487 |
| C5c deadline timer is the scheduler's | open a stream and push nothing: `scheduler` has exactly one entry with `delayMs = resolutionTimeoutMs`; global timers 0 | route `withinDeadline` through `setTimeout` |

**Deadline and reconnect edges (one predicate each)**

| Test | Schedule and assertion | Kills |
|---|---|---|
| C6a deadline on a dropping stream (685, `now() >= deadline`) | stream drops at once, status `null`, `maxReconnects` 5. With the clock at `deadline - 1` at the probe: one more `openEvents`, no recover. With the clock at `deadline`: recover with trigger `timeout` after exactly 1 `openEvents` | `>=` to `>` at 685 |
| C6b reconnect count (685, `attempt === maxReconnects`) | `maxReconnects` 2, status `null`, clock frozen before the deadline: recover (`timeout`) after exactly 3 `openEvents`, not 2 | `maxReconnects` to `maxReconnects - 1`; `===` to `>` |
| C6c counter reset on a live run (652) | `maxReconnects` 1; statuses in order `null`, `200`, `null`, `null`; the fake serves an `end succeeded` frame on a 5th open. Assert: recover (`timeout`) after exactly 4 opens, no settlement | `===` to `>` at 652 (the counter passes the limit and is never equal again: the 5th open settles `succeeded`) |
| C6d stalled stream (624-637) | the stream opens and yields nothing. At scheduler time `deadline - 1`: no probe. At `deadline`: one probe. Status 200: deadline renewed, `openEvents` still called once, the same stream is kept. Status `null`: recover (`timeout`) | delete the renewal at 637; `status !== 200` to `status === 404` at 631 |
| C6e status probe bound (422-433) | `runStatus` never resolves. At `statusTimeoutMs - 1` the probe is pending; at `statusTimeoutMs` it resolves `uncertain` and the signal given to `runStatus` is aborted | remove `withinDeadline` from `probe`; remove `abort.abort()` |

**Watch end**

| Test | Schedule and assertion | Kills |
|---|---|---|
| C7 effect order at watch end | recorded order: stream aborted, `release`, `onAttemptEnded`, `active` empty; a throwing handler still empties `active`; a failure case is bounded by `idle()` with a scheduler-driven timeout so a leaked watch fails the test | reorder the `finally` block; drop the inner `finally` |
| C8 same-client successor | start a second watch for the run during the first one's recovery delay and hold it open through the first cleanup; the first cleanup does not call `release` and does not remove the successor | remove the `successor` check at 775 or the identity check at 779 |
| C9 `newAttempts` lifetime (F1) | records which client receives `cancel` for a new attempt after its first watch was replaced | change line 770 to delete only when no successor exists (the test then shows the other client) |
| C10 settle rejection (F2) | one-shot rejection of `ledger.settle`: row stays `running`, `activeCount()` is 0, a later `watch` adopts it and settles | add a retry inside `settle` |

**Rejections: C11-R** (5.3; the process is alive). One test per row of the 5.3 table, each with a throwing fake used three ways (an `Error`, a non-`Error` value, a rejected promise), asserting the "Result" column. Two rows carry the weight:
- launch rejects: exactly one diagnostic checkpoint with code `run_launch_unconfirmed`, **and one watch is started** for the same attempt (`activeCount()` 1, one `openEvents`). Kills: remove `attach` after a failed launch.
- cancel rejects: the decision continues (CAS happens, one launch). Kills: remove `.catch` at `recover.ts:196`.

**Process death: C11-H (halt matrix).** The harness wraps every port finalizer 1 was given (ledger, durable store, daemon, scheduler, `onAttemptEnded`, tracker) in `haltable(port)`. Before `halt()` calls pass through. After `halt()`:
- a new call does nothing and returns a promise that never settles;
- a call that was in flight either never reached the real store ("before commit") or completed on the real store ("after commit"); in both cases its promise never settles for finalizer 1;
- scheduler callbacks registered by finalizer 1 are dropped; a global trailing timer that still fires reaches a halted `ledger.checkpoint` and does nothing;
- open event streams of finalizer 1 are closed from the daemon side, as the OS would do.

The harness records every call attempted after `halt()`. Finalizer 2 is then built on the same database and runs `reconcileInterrupted`. For each crash point in 5.2 (S before/after, K before/after, R before/after, D after-advance and after-launch, X after-cancel) the test asserts final status, content, number of launches, number of attempts, and that no post-halt call from finalizer 1 changed the database. Kills: treat 404 as terminal success (S before, daemon gone: expects exactly one new launch, C12); skip the launch grace (D after-advance inside 10 s: expects zero launches); drop the boot `recover` callback's `!message.runId` arm.

This matrix makes no claim about `expectedRunId` or the terminal guard. Boot passes no `expectedRunId`, and a sequential crash and restart never has a checkpoint in flight after a settle. Those two guards have their own races below.

**Process death: C11-P (one real process).** One smoke test: a child process (`child_process.fork`, same `execArgv`) opens a file database (`openChatDb(path)` in a temp dir, the reopen pattern of `restart.test.ts:106`), runs a watch against a scripted daemon, signals the parent after K3 commits, and is killed with `SIGKILL`. The parent opens the file and runs boot recovery. Not verified: that the `tsx` loader flags reach the child. If the seam does not work, C11-P is dropped and the INDEX says so; C11-H stays the contract.

**Guard races (each guard at an outcome only it protects)**

| Test | Schedule and assertion | Kills |
|---|---|---|
| C11-G1 stale watch hand-off (`expectedRunId`, `recover.ts:300`) | attempt X is advanced to Y by a browser recover; Y's launch is rejected, so Y answers 404. Clock +10 s (past the grace). Then the old watch's `recover({ expectedRunId: X, trigger: "stream" })` runs. Assert `superseded`, launches total 1, `recoveryCount` 1. Without the check the call loads Y, finds it dead and continues it: the CAS cannot stop that, because it compares against the row just loaded | delete line 300 (2 launches, count 2) |
| C11-G2 engine stops checkpointing at terminal (518, 494) | (a) frames with unsaved growth, then an end frame while a trailing timer is armed; fire the timer callback captured before cleanup: zero `ledger.checkpoint` calls after `settle` started. (b) a held checkpoint rejects after `settle`: no retry timer is armed | (a) remove `watch.terminal` from 518; (b) remove it from 494 |
| C11-G3 ledger rejects a checkpoint that finishes after settle (real database) | hold a checkpoint that started before the end frame (before it reaches the store); let `settle` commit; release the checkpoint. Assert it returns `false` and row status and content are the settled ones | **none in the engine.** The check at 567 is redundant with 518 (a re-entry returns at 518), so no test can separate it. The guard with a unique outcome is the ledger predicate (`run-ledger.ts:281-293`), Jini code this plan does not edit; the test pins the contract the engine relies on |
| C13a live probe against settlement (`decide` reload, `recover.ts:239-240`) | hold `runStatus`; settle the row through the ledger; release with 200. Assert result `terminal`, `activeCount()` unchanged, no `openEvents` | delete the reload in `decide` (result `reattached`, a watch starts on a terminal row) |
| C13b live probe against a new generation | hold `runStatus` for X; another caller advances to Y; release with 200. Assert `superseded` and no watch for X | same; also `current.runId !== run.runId` at 276 |
| C13c live probe against cancel | hold `runStatus`; `store.cancel`; release with 200. Assert `finalized`, row `canceled` with the stopped notice | remove `exclusion` at 278 |
| C13d cancel in the CAS window (`recover.ts:208`) | hold the post-CAS `load`; `store.cancel` with the new run id (the test injects `mintRunId`, so it knows the id); release. Assert `finalized`, zero launches. A cancel with the old id is a no-op after the CAS (`lockedRun` finds no row), so only a caller that already knows the new id reaches this line | delete line 208 |
| C13e two recovers of one dead attempt | one launch, results `continued` and `superseded`. Integration baseline. **No mutation claim:** three guards overlap (5.4) | none claimed |
| C16 terminal in the CAS window (F4, W1) | hold the post-CAS `load`; settle the new attempt `failed` through the ledger; release. Records today's behaviour: `launch` is called once, result `continued`, `activeCount()` 0 (no watch) | the future fix (terminal check before launch) flips this test: zero launches. The test is written so the fix changes exactly these three assertions |
| C17 finalize during launch (F4, W2) | third continuation; hold `daemon.launch`; a second `recover({ trigger: "browser" })` runs with `runStatus` 404. Records today's behaviour: row `failed` with the exhausted notice while the launch is pending; after release, one watch runs and its `settle` returns `false` | moving the grace check before `budgetNotice` flips it to `waiting` |

**Boot**

| Test | Schedule and assertion | Kills |
|---|---|---|
| C12 finished but unsettled (F3) | halt before S3 with the daemon gone: exactly one new launch, same message id | treat 404 as terminal success |
| C14 boot handles one row at a time | 3 unfinished rows; the fake `runStatus` counts calls in flight and each call is held. Assert: at most 1 in flight; the probe for row 2 starts only after row 1's probe was released or timed out; `reconcileInterrupted()` is unsettled until the third finishes; order is message-id order. The loop is Jini `run-ledger.ts:308-309`, which this plan does not edit; the engine's part is that its callback awaits `recovery.recover` (705) | return from the callback at 705 without awaiting (3 in flight); `Promise.all` over the rows |
| C18 boot waits for a stalled launch (5.2 path B) | one dead row past the grace; `daemon.launch` never resolves; advance the scheduler past every engine deadline. Records today's behaviour: `reconcileInterrupted()` is still pending | wrapping `launch` in `withinDeadline` flips it |

**Public surface: C15** (three parts, because 4 of the 7 exports are interfaces and do not exist at run time)

| Part | Assertion | Checked by |
|---|---|---|
| C15a run-time exports | `Object.keys(await import(path)).sort()` equals the list for the current stage (table below) | the test runner |
| C15b object shape | `Object.keys(finalizer).sort()` equals `activeCount, idle, reconcileInterrupted, recover, watch` | the test runner |
| C15c type contract | a type-level equality in the same test file: `keyof AssistantRunFinalizer` is exactly those 5 names; `keyof RunDaemonClient` is exactly `cancel, launch, openEvents, release, runStatus` | `npm run typecheck:tests` |

C15 is edited in these commits and no others:

| Commit | C15a expected | C15b / C15c |
|---|---|---|
| Phase 0 | old path: `assistantRunFinalizerFor`, `createAssistantRunFinalizer`, `createHttpRunDaemonClient` | 5 methods |
| A1 | old path: the first two; `run-daemon-http-client.ts`: `createHttpRunDaemonClient` | `RunDaemonClient` type imported from the new path |
| A7 | `run-finalizer/entry.ts`: `createAssistantRunFinalizer`; `run-finalizer/shared.ts`: `assistantRunFinalizerFor`; the old path no longer resolves | unchanged |
| B2 | `composition/jini-run-finalizer.ts`: `createAssistantRunFinalizer`; `composition/shared-run-finalizer.ts`: `assistantRunFinalizerFor` | unchanged (5 methods) |
| C-2 | `shared-run-finalizer.ts` no longer resolves | 7 methods: the 5 plus `useAttemptEndedHandler`, `useRecoveryDaemon` |

### Phase X: one behaviour fix that OD-1 requires (Tovu, red-first, before the split)

| Commit | Change | Red first | Green alone because |
|---|---|---|---|
| X1 | `readStream` cancels the body of a 404 or other non-OK response before returning, and ignores a rejected cancel (`void response.body?.cancel().catch(() => undefined)`, the form already used at 580). The cancel is not awaited, so a body that never finishes cancelling cannot stall the watch. Fixes F5. | three new tests, ported from `finalizer-boundaries.test.ts:61-93`: 404 body cancelled, 503 body cancelled, a body whose `cancel` rejects changes nothing. They fail on the unmodified file. | no other behaviour changes; the 15 files and Phase 0 stay green |

This is a behaviour change, so it is not part of a refactor commit. It needs no new owner decision: OD-1 says to reconcile the baseline, and keeping a tested guarantee is the conservative reading. The owner can veto it; the alternative is to record the missing cancel as an accepted regression in the 0.x release note.

### Phase A: split inside Tovu (behaviour unchanged)

Prerequisite for all: Phase 0 and X1 merged and green. Each commit runs the 15 files plus the Phase 0 files, `typecheck`, `typecheck:tests`, `check:size`, `check:complexity`.

| Commit | Change | Callers and tests updated in the same commit | Green alone because |
|---|---|---|---|
| A1 | Move `RunDaemonRequest`, `RunDaemonClient`, `daemonHeaders`, `createHttpRunDaemonClient` to `modules/run-daemon-http-client.ts`. No re-export from the old file. | `assistant.ts:84`, `assistant-chats.ts:35`; tests: `http-client.unit`, `observability`, `chat-recovery.unit`, `chat-recovery-bounds.unit`, `assistant-daemon-connection.test`, and every test importing `type RunDaemonClient` (7 files); C15 (table above). Re-key the `createHttpRunDaemonClient#1` size-debt entry to the new path. | pure move; the finalizer imports the type from the new file |
| A2 | Extract `createRunDaemonOrigins` (`origin`, `replayOrigin`, `retainLiveOrigin`, `release`, `current`) to `modules/run-daemon-origins.ts`; `previous` and `initialToken` stay read in the client factory body before anything else (E2, E3). Every function at most 50 lines; remove the size-debt entry. | none | C3 guards the snapshot; the 12 client tests guard origin choice |
| A3 | Create `modules/run-finalizer/`: `watch-state.ts` and `checkpoint-policy.ts` receive the module-level helpers and `Watch`. | none (not exported) | pure move of functions that close over nothing |
| A4 | `checkpointer.ts`: `createCheckpointer({ ledger, now, checkpointTimers, log, checkpointIntervalMs })`. The factory in the old file passes a `checkpointTimers` object built from global `setTimeout` + `unref`, and a `log` object that calls `console.error` with today's string. Add `report.ts` (`reportSafely`) and use it for the checkpoint log call (4.4). | new test: a `log` fake that throws (three ways) does not stop the backed-off retry and causes no unhandled rejection | C5a to C5c and the 16 backoff tests; with the console binding nothing observable changes |
| A5 | `stream.ts` and `bounded-follow.ts`. `settle`, `recoverWatch` and `retainLive` are passed in as functions. | none | reconnect-pin (8), bounds (7), C6a to C6e, the X1 tests |
| A6 | `recovery-binding.ts` owns `newAttempts`; the registry calls `attemptEnded({ runId })` at the same point as line 770. `recoveryDaemon` is passed as `() => options.recoveryDaemon`. | none | C1 (existing test), C9, C11-R, C13a to C13e, `adopted watches use the recovery daemon...` |
| A7 | `entry.ts` holds `createAssistantRunFinalizer` (assembly, `active`, `startWatch` with the cleanup split into `endAttempt`, so cyclomatic complexity is at most 10) and `shared.ts` holds `assistantRunFinalizerFor` unchanged. The watch log call (765), the cleanup warning (778) and both `setOutcome` calls go through `reportSafely`. Delete `assistant-run-finalizer.ts`. Replace the two `Record<string, never>` optionals (76, 645). | the 4 production importers, the 15 test files, `measure-site-memory.mjs:649`, the comment in `extraction-dossier.mjs`; C15; remove the remaining 2 size-debt entries and the complexity entry; new test: a throwing `log` or `span.setOutcome` fake still empties `active` and `idle()` resolves | C2, C7, C8, C15, all 109 |

After A7: largest file about 190 lines; every function at most 50 lines; no entry for these paths in either debt file.

If untangle R4-chat merges during Phase A, its Tovu caller edit adds `agents: chatAgentFailures` to the `createDurableRecovery` call: at line 380 before A6, in `recovery-binding.ts` after. Whichever lands second rebases that one line.

### Phase B: engine to Jini (OD-1 decided: move, and replace the stale copy)

| Commit | Repo | Change | Prerequisites | Green alone because |
|---|---|---|---|---|
| B1 | Jini | Replace the Jini copy's `entry.ts` and `ports.ts` with the files of 4.1 (from Tovu `modules/run-finalizer/`, with the 4.3 call-shape changes; `recoveryDaemon` and `onAttemptEnded` become function ports). Port the engine tests to vitest. Handle the copy's 26 tests exactly as the table below says. Add `STOPPED_NOTICE` to `core/durable-runs/policies.ts` and import it in the engine and in `recover.ts` (which has its own copy at line 12). Update `knip.json:223`, `scripts/size-debt.json:591`, add fakes to `@jini-ai/chat/testing`. | Phase A done. **Hard:** untangle C6 and R4-chat row 390 merged in Jini (`recover.ts` has no `@jini-ai/agent-runtime` import; `RecoveryPorts.agents` exists). B1 is blocked until then. | no Jini consumer exists. Gate: `pnpm guard`; and `rg "@jini-ai/" packages/chat/src/server/run-finalizer packages/chat/src/server/durable-runs/recover.ts` shows only `@jini-ai/core` |
| B2 | Tovu | Add `composition/jini-run-finalizer.ts` (4.2) with the two function ports closing over `options` by reference. Delete every file under `modules/run-finalizer/` except `shared.ts`, which moves to `composition/shared-run-finalizer.ts` **with no edit to its body**. Engine-behaviour tests leave Tovu only if B1 ported them (same titles); wiring, HTTP-client and real-database tests stay. Regenerate Jini `host-callers.json` and `caller-ledger.csv` rows. | B1 built (`pnpm -r build`) and the Jini version Tovu resolves contains it | **C1 and C2 by name** (they go through `shared-run-finalizer.ts` and fail if the binding copied `options`), C4 (binding passes `ledger` by reference), C15, the 15 Tovu files (fewer tests, each accounted for) plus Phase 0 |

**The Jini copy's 26 tests, one by one (judge finding 6).** "Same" means the ported engine test asserts the same statement. A changed expectation names the difference (D1 to D7 below).

| # | Test (`finalizer.test.ts` line) | In B1 |
|---|---|---|
| 1 | 48 saves the full answer, compacts deltas | same |
| 2 | 62 forgotten run keeps partial output and adds the notice | changed: no-recovery mode; D1 (probe first), D2 (notice text) |
| 3 | 67 replays from zero once after reconnect | same; `openEvents` now also receives `{ signal }` |
| 4 | 75 unproven run stays unsettled after exhaustion | same, in no-recovery mode (457-460) |
| 5 | 83 error frame then successful end is `failed` | same |
| 6 | 87 failed, canceled, never-started ends keep notices | same |
| 7 | 94 ignores user, terminal, no-status, external runs; dedupes | same; D3 (a stopped watch is replaced) added as a case |
| 8 | 103 quiet run checkpoints at the trailing deadline | changed: D4 (trailing timer on `checkpointTimers`, growth rule) |
| 9 | 115 settles without waiting for a blocked checkpoint | same |
| 10 | 126 honours a row already settled in the browser | same |
| 11 | 143 settlement error is reported, watch cleared, throwing reporter tolerated | same statement through `log` and `reportSafely` (4.4); also asserts span outcome `abandoned` |
| 12 | 159 no rescheduling after exhaustion with a pending checkpoint | same |
| 13 | 170 split CRLF frames; reader cancelled at the terminal record | same for settle and for `cancel`. The `body.locked === false` assertion: run it unmodified first. In Node 22.23 an early return from a stream piped with a signal cancels the source at once and releases the lock a few turns later. If it fails only for that, wait for the release and record D5. Not verified on the real engine |
| 14 | 184 truncated terminal record is not settled | same |

| # | Test (`finalizer-boundaries.test.ts` line) | In B1 |
|---|---|---|
| 15 | 61 a 404 stream settles interrupted without asking status | changed: D1. The body-cancel assertion is kept (X1) |
| 16 | 71 a non-success body is cancelled and treated as dropped | same (X1) |
| 17 | 80 a successful response without a body is dropped | same |
| 18 | 87 a body whose cancel rejects is tolerated | same (X1) |
| 19 | 95 rejected `openEvents` is dropped and sleeps the delay | changed: D6 (one sleep fewer; delay capped by the deadline) |
| 20 | 104 status 404 settles interrupted | changed: no-recovery mode; D2 |
| 21 | 113 a canceled end after an error frame stays canceled | same |
| 22 | 120 pending trailing checkpoint is cancelled at settle | same, on `checkpointTimers` |
| 23 | 132 a rejected checkpoint is reported and the watch goes on | same; plus the backed-off retry (D4) |
| 24 | 141 one trailing timer while the interval has not passed | same |
| 25 | 149 trailing timer replaced by an immediate checkpoint | same |
| 26 | 165 documented defaults | changed: D7 (defaults are 2 s, 30, 120 s, 5 s, size-based checkpoint interval) |

No test is deleted without a row. The commit body repeats this table with the new test titles.

Differences where the file's behaviour replaces the copy's. Each is deliberate in the file and has a why-comment or a test there; each goes in the 0.x release note (OD-7):

| Id | Jini copy | The file (kept) | Evidence |
|---|---|---|---|
| D1 | an events 404 settles `canceled` at once | the owning daemon is probed first; a 200 keeps the run | comment at 667-669 |
| D2 | the notice is `notices.interrupted` from the host | no-recovery arm writes the literal "Stopped. Saved work is above." (461), the same text recovery and the ledger use; Tovu's `RUN_NOTICES.interrupted` is "Run interrupted" and is not used here | 461; `recover.ts:12`; `run-ledger.ts` in `reconcileInterrupted`. `runInterruptedNotice` in `core/run-events` loses its only non-test caller; it stays exported; B1 must run `knip` and report |
| D3 | `active.has(runId)` blocks any second watch | a watch that has stopped but not cleaned up is replaced | 716, 779 |
| D4 | growth by event count; fixed 1 s; a failed write reruns at once | growth by text, extension events, tool ids; 1/3/10 s by size; backed-off retry | 323-343, 490-498, comment at 563-566 |
| D5 | reader released by the time `idle()` resolves | released a few turns later (pipe with abort signal, 589-591) | experiment above; to confirm in B1 |
| D6 | sleeps after every failed attempt, the last one too | no sleep before giving up; the delay is capped by the time left to the deadline | 671-678 |
| D7 | 3 options, fixed defaults | 5 options | 299-302 |

Test homes after B: Jini owns checkpoint cadence/backoff, stream replay, bounded resolution, reconnect pins, span outcomes, C5 to C8, C11-R, C11-G2 (about 50 of the original 109 call sites plus the engine-level Phase 0 tests; the exact list is fixed when B1 is dispatched). Tovu keeps `http-client.unit`, `assistant-daemon-connection`, `chat-recovery.unit` (C1 is there), `checkpoint-route`, `chats-skill-title`, `launch-cause`, `restart`, `durable-finalizer`, `failed-run.integration`, `desktop-assistant-admission`, the halt matrix, C11-P, C11-G3, C2 to C4, C15.

### Phase C: composition owns the instance (needs OD-2)

| Commit | Change | Prerequisites |
|---|---|---|
| C-1 | `RouteDeps` gains `assistantRuns: () => AssistantRunFinalizer` (memoized, lazy so a test that never touches chat does not open the database, E1). Built beside `chatRunLedger` at `deps.ts:2333` and `app.ts:1299`. 8 test files assign `chatRunLedger` by hand and need the field. `jini-run-finalizer.ts` gains the two cells and the two host methods (4.2); the options still seed them. | size design 01 (composition deps) decides the file that holds the `chatRunLedger` line; land after it or re-point |
| C-2 | The 4 production callers use `deps.assistantRuns()`. `assistant-chats.ts` calls `useRecoveryDaemon`, `assistant-byok.ts` calls `useAttemptEndedHandler`. Delete `shared-run-finalizer.ts` and the `WeakMap`. Tests that called `assistantRunFinalizerFor` (3 files, C1 and C2 among them) read `deps.assistantRuns()` and install through the methods; their assertions do not change. | size design 02 moves `registerSiteIdlePark` (`app.ts:2030`) to `public-middleware.ts`; whichever lands second edits the moved line |

## 8. Interaction with other plans

| Plan | Overlap | Order |
|---|---|---|
| Untangle C6 + R4-chat | C6 creates `chat/src/core/agents-port.ts` (`ChatAgentFailurePort`); R4-chat removes the `@jini-ai/agent-runtime` import from `recover.ts` and adds `RecoveryPorts.agents`; Tovu binds `chatAgentFailures` in `composition/jini-agents.ts` | **prerequisite of B1** (hard). Independent of Phases 0, X and A, except the one rebased line noted under Phase A |
| Untangle C0 gate (`L5-injected-edge`) | new engine files in chat must add no debt | B1 adds zero non-base imports; the Jini copy's one import (`Clock`) is already compliant (`EDGES-sites.tsv:349`) |
| Daemon R7 (routes to `ServerRoute[]`) | `/api/runs`, `/api/runs/:id`, `/events`, `/cancel` are what the Tovu HTTP adapter calls | paths and status codes must not change; R7's judge finding on `/api/runs` vs `/api/runs/:runId/events` precedence is the same contract the adapter relies on. No file overlap |
| Daemon R8 (runtime ports) | none in files; `agent-session-preset.ts` (source of `agentCarriesOwnMemory`) wraps `@jini-ai/daemon/session-coordination` | if R8 changes that helper's signature, only the lambda in `jini-run-finalizer.ts` changes |
| Size design 01 (composition deps) | Phase C adds one `RouteDeps` field | C-1 after 01 |
| Size design 02 (composition app) | `registerSiteIdlePark` moves; `createAssistantChatsModule` wiring at `app.ts:2385` | A7 changes one import in `app.ts`; if 02 lands first the import lives in `public-middleware.ts` |
| Untangle Q8 / Q1 (Node adapters to host preset) | the Node timer defaults and `ps` check are bound in Tovu, not in a Jini domain package | compliant; if the owner wants the Jini `server` preset to offer a default finalizer, that is new work, not part of this design |

## 9. Estimate (Sonnet tokens unless marked)

| Phase | First version | Now | Why it changed |
|---|---|---|---|
| 0 characterization | 250k | 420k | 15 tests became about 45 cases (edges split, guard races, 8 rejection rows, 9 halt points, C16 to C18); halt harness; one child-process test; every named mutation is run once |
| X1 | none | 40k | new |
| A1-A7 | 480k | 510k | `reportSafely` and two throwing-fake tests |
| B1 | 450k | 490k | 26-row reconciliation, function ports, closure gate |
| B2 | 180k | 180k | |
| C-1, C-2 | 200k | 210k | host cells and two methods |
| Opus review of Phase 0 tests and of B1 | 90k Opus | 130k Opus | more tests to review against their mutations |
| **Total** | 1.56M + 90k Opus | **about 1.85M Sonnet + 130k Opus** | |

Phase 0 + X + A alone: about 970k.

## 10. Owner decisions

| # | Question | Status |
|---|---|---|
| OD-1 | Engine home. | **Resolved by the owner: (a).** The engine moves to Jini and replaces the stale copy at the same export. Its behaviour baseline is reconciled test by test (7, Phase B) and two guarantees are kept (4.4). |
| OD-2 | Shared instance. (a) `RouteDeps.assistantRuns()` with explicit `useRecoveryDaemon` / `useAttemptEndedHandler` on the Tovu object. (b) Keep the per-ledger `WeakMap` as a recorded exception to practice 1. | Open. Recommendation (a), unchanged. The revision moved the two methods from the Jini engine to the Tovu object. |
| OD-3 | Timers. (a) Keep two ports so the trailing checkpoint timer stays unref'd and outside `scheduler`. (b) One port with a `keepAlive` flag. | Open. Recommendation (a). |
| OD-4 | `runStatus` returns an HTTP status number. Keep, or change to `"live" / "missing" / "unknown"`? | Open. Recommendation: keep in this refactor. |
| OD-5 | Practice 9 exceptions found: unredacted `console.error(..., error)` at 558 and 765; errors turned into `null`/`dropped`/`undefined` without a record at 204, 254, 430, 622 and in recovery's `cancelAttempt(...).catch`. Fix inside this refactor or after? | Open. Recommendation: after, red-first. The log port introduced in A4 is where the fix goes. |
| OD-6 | F1 to F4 (6): pin now and fix later, or fix first? | Open. Recommendation: pin now. F1 and F2 are small and worth fixing right after Phase A. F3 needs a design (a durable end marker). F5 is fixed in X1. |
| OD-7 | Jini `@jini-ai/chat/server/run-finalizer` changes its exported API and seven behaviours (D1 to D7) in B1. It is published in 0.7.1 with no known consumer. | Open. Recommendation: accept as a breaking change in the next 0.x release note. No alias for the old name (practice 5). |
| OD-8 | **New.** F4: a continuation can run under a terminal row. Fix needs three parts in Jini `recover.ts`: check `runStatus` before launch; put the launch grace before the budget check for a queued attempt; re-check the row after launch and cancel the attempt if it is terminal. | Open. Recommendation: pin now (C16, C17), fix as its own red-first change in Jini. It does not block the refactor, and the refactor does not make it worse. |
| OD-9 | **New.** Practice 2 and functions with no required value: `idle()`, `activeCount()`, `mintRunId()`, `Clock.nowMs()`. | Open. Recommendation: leave them. The first two are today's contract (over 100 call sites); the last two are existing Jini contracts. If the owner wants `(required = {}, optional = {})` everywhere, it is a separate mechanical change. |

## 11. Practices check

| # | Practice | Status in the target | Conflict or exception |
|---|---|---|---|
| 1 | DI, typed ports, no global or singleton | Engine receives 15 ports and holds no late-bound state. Tovu binds them in one file. | Until Phase C the `WeakMap` stays (OD-2). `fetch` and `setTimeout` are read as globals only inside Tovu adapters. `createDurableRecovery` defaults its logger to `console` (`recover.ts:140`); existing, not added. |
| 2 | `(required, optional = {})`, never `?: Record<string, never>` | New port methods and new factories follow it (4.1). | **Partly.** Zero-argument functions are kept as they are: `idle()`, `activeCount()`, `mintRunId()`, `Clock.nowMs()` (OD-9). Two existing `Record<string, never>` optionals (76, 645) are fixed in A7. Jini `readSseFrames` and `isDaemonRunId` have `_options: Record<string, never>`; not in scope. |
| 3 | Functions at most 50 lines, files at most 500, complexity at most 10 | Largest file about 190; the two long factories and the complexity-11 callback are split. | `checkpoint` is about 47 counted lines today; it is split into "decide" and "write" in A4 to leave margin. Counts are from reading, not from the lint tool. |
| 4 | Feature slicing by responsibility | 9 engine files, one responsibility each (4.1 table). | none |
| 5 | No barrels, shells, forwarders, aliases | Old path deleted in A7; old Jini API deleted in B1; callers repointed. | `jini-run-finalizer.ts` is wiring with 9 bindings. In Phase C it returns the engine's own methods plus two host methods; it wraps none. |
| 6 | Why-comments move with code | The header comment (7-33) goes to `entry.ts`; each function's comment moves with it; the Tovu-specific paragraph ("Why finalization stays in the API") stays in `jini-run-finalizer.ts`. | Comments that cite Tovu report paths are reworded in Jini without the path. |
| 7 | Generic to Jini, one-site to Tovu; package imports only itself, core, protocol | Engine in chat imports chat and `@jini-ai/core/primitives`, and so does everything it executes. | True only after untangle C6 + R4-chat. B1 is blocked on them and checks the closure, not only the folder. |
| 8 | Tests use fakes of interfaces; characterization first; bugs red-first and mutated | Phase 0 first; each test names one predicate and the mutation it must fail on, and the mutation is run. X1 is red-first. | Tovu's halt matrix, C11-G3 and restart tests use the real chat database on purpose: the guard under test lives there. C13e makes no mutation claim. |
| 9 | Errors never swallowed or generic; logs redacted | Unchanged by this refactor. | OD-5 lists the existing exceptions. **New conflict:** `reportSafely` swallows a throw from the log or span port (4.4). `launch` throws `continuation rejected (${status})`, which is plain but has no pasteable detail. |
| 10 | No new `eslint-disable` / `@ts-ignore`; no silent behaviour change | None planned. | One behaviour change, not silent: X1. Seven differences for Jini consumers, listed (D1 to D7). The timing reads in 2.3 and the timer split in 2.4 are where a silent change would happen; C1 to C5 guard them. |
| 11 | Smallest change, reuse first, no abstraction with one user, reversible | Reuses recovery, ledger, run-events, checkpoint policy. Each phase can stop. The engine lost two setter methods in this revision. | `RunTimerPort`, `RunSpanPort`, `RunLogPort` each have one implementation in Tovu; they exist because B1 forbids the direct import, not for variation. `recoveryDaemon` takes `{ runId }` that Tovu ignores; it is what makes the port a function of the run and not a bare thunk. |
| 12 | Memory and IO cost on hot paths | No change: one open stream, one pending checkpoint, one trailing timer and one deadline timer per run; `approximateJsonBytes` avoids a second serialization. X1 removes up to 30 held response bodies per failing run. | Boot repair is sequential and gates chat routes; a dead row past the grace also waits for `cancel` and `launch`, which have no whole-operation bound (5.2 path B, 5.5). |

Lessons file (`size-designs/LESSONS-FOR-DESIGN-BRIEFS.md` on `plan/size-designs-2026-11-16`): it holds 11 rules, not 20. Rules 1, 2, 4, 9: sections 1 to 4. Rule 3: 2.3 and the 4.2 hand-off table. Rule 5: 7, with C1/C2 named in B2's gate. Rule 6: every Phase 0 row names a predicate and a mutation that is run. Rule 7: 4.3 (`onAttemptEnded` optional field against a required port; `recoveryDaemon` returning `undefined`). Rule 8: 11 practice 3. Rule 10: 8 and the B1 prerequisite. Rule 11: `typecheck:tests` added; seams cited by file and line; C11-P's seam marked unverified.

The judge's four recurring classes: redundant guards (5.4, C13a to C13e, C11-G1 to G3); process death against rejection (5.2, 5.3, C11-H, C11-P, C11-R); two baselines (4.4, the 26-row table, D1 to D7); durable transition against external launch (5.1, F4, C16, C17).

## 12. Not verified

- No test, typecheck or lint of either repository was run. Line counts per function are from reading the file and the debt JSON.
- Two small Node 22.23 scripts were run outside both repositories (stream cancel and lock timing; an untouched 503 body; a throwing reporter inside `.catch`). They support 4.4 and D5. They are not product tests.
- No mutation named in Phase 0 was run. The schedules were derived by reading the code.
- Whether `Tracker` (overloaded `trace`) is assignable to the single-signature `RunSpanPort` (4.3).
- Whether a forked child inherits the `tsx` loader for C11-P.
- Whether `recoveryLedgerFixture` can hold a single `store.load`; if not, the ledger wrapper in Phase 0 provides it.
- F1 to F5 are from code reading only. W1 of F4 needs a store call to yield between the CAS and the reload; the store is asynchronous, but the interleaving was not produced.
- `ensureAssistantDaemonReady` and `fetchWithDaemonParkRecovery` were not read; 5.5 says only that this file puts no bound on them.
- `assistant-daemon-client.ts` (`daemonFetch`, `fetchAgentDaemon`) was not compared with the HTTP adapter for shared logic; a merge of the two is not proposed.
- Whether `policies.ts` is in any untangle lane's file list (B1 adds one constant to it), and whether `knip` flags `runInterruptedNotice` after B1.
- Size designs 01 and 02 were searched for overlaps by keyword, not read in full.
- The date on which untangle C6 and R4-chat merge. Until then B1 cannot start.

## Judge response

Judge: Codex gpt-6.1-sol HIGH, `CODEX-JUDGE.md`. Every finding was checked against the code at the same two commits before it was accepted. Result: 10 accepted (2 of them extended beyond what the judge wrote, 1 accepted with listed exceptions), 0 rebutted. One detail inside finding 2 is corrected.

| # | Severity | Verdict | Evidence checked | What changed |
|---|---|---|---|---|
| 1 | Blocker | **Accepted** | The wrapper writes only `existing.options.recoveryDaemon` / `.onAttemptEnded` (801-802); the engine reads that object at 384, 389, 397, 776. Engine-internal cells would never see the write. | The engine has no setters and no cells. `recoveryDaemon` and `onAttemptEnded` are function ports called at every use (4.1). B2's binding closes over the same `options` object, so `shared-run-finalizer.ts` moves with no edit (4.2 hand-off table). C1 and C2 are named in B2's gate. The cells and the two install methods appear only in Phase C, on the Tovu object. |
| 2 | Major | **Accepted and extended** | `recover.ts:204-208` checks id and cancel reason, not `runStatus`; 209 launches. `budgetNotice` (286-287) runs before the grace check (290); `advance` writes `recovery_count + 1` (`durable-run-store.ts:409`); `RECOVERY_LIMIT` is 3. `watchable` refuses a terminal message (359-362). Correction to the judge's schedule: the store calls are `kernel.transaction` / Kysely promises, so the window between CAS and reload exists, but a competing recover needs several awaits including an HTTP probe to fit in it; it is narrow with in-process SQLite. A second, wider window was found: the launch request itself (5.4), which a pre-launch check cannot close. | 5.1 no longer says the reload makes continuation safe; it separates the two boundaries. F4 added (6). C16 (W1) and C17 (W2) pin today's behaviour. OD-8 asks for the fix as its own change. D path in 5.2 notes the third-recovery case. |
| 3 | Major | **Accepted** (all three) | C6: 652 is in the live-200 branch of `prepareReconnect`; 683-685 return before `attempt` matters for 200; a stalled stream goes 624-634 to `unresolved` and never reaches 685. C13: a dead-attempt race still passes the reload at 266-267 and the CAS. C14: the stated assertions hold for a parallel loop. | C6 split into C6a to C6e, one predicate and one schedule each. C13 split into C13a to C13d at outcomes only one guard protects; the old test stays as C13e with no mutation claim. C14 asserts at most one probe in flight and start-after-finish; the probe bound moved to C6e. |
| 4 | Major | **Accepted** | Caught on purpose: cancel at `recover.ts:156`, `196`; launch at 177-190 followed by `attach` at 210; checkpoint at 557-569. Boot passes no `expectedRunId` (705). | 5.2 defines a crash as process death; 5.3 lists every rejection and who handles it. C11 is now C11-R (rejections), C11-H (halt harness: ports that never settle, callbacks dropped, post-halt calls recorded), C11-P (one real `SIGKILL`), and the guard races C11-G1 (`expectedRunId`), C11-G2 and C11-G3 (terminal guard with a checkpoint in flight after settle). |
| 5 | Major | **Accepted** | `readWithinBound` arms a scheduler timer while a stream is open (624-626, 410-419). The 7 exports are 4 interfaces and 3 functions (62, 68, 79, 116; 142, 370, 795). `tsconfig.json:22-23` excludes tests from `npm run typecheck`. | C5 is C5a to C5c and asserts a delta against the existing deadline timer, plus `unref` separately. C15 is run-time exports per stage, object keys, and a type contract checked by `npm run typecheck:tests`; its edits are listed per commit. The engine keeps 5 methods through Phase B; 7 only after C-2, and C-2 lists that edit. `typecheck:tests` added to every gate. |
| 6 | Major | **Accepted** | Jini `entry.ts:147-151` cancels; tests at `finalizer-boundaries.test.ts:61-93` require it; the file returns at 583-584. Jini `entry.ts:83-85` contains a throwing reporter; test at `finalizer.test.ts:143-156`. Both effects reproduced in Node 22.23 (open body; unhandled rejection). | 4.4 keeps both guarantees. X1 fixes the missing cancel red-first in Tovu before the split (F5). `reportSafely` is added with the ports in A4 and A7, with throwing-fake tests. All 26 tests of the copy have a row in Phase B; seven deliberate differences are named D1 to D7 with evidence. OD-7 now covers the behaviour differences, not only the API. |
| 7 | Major | **Accepted** | `recover.ts:2` imports `@jini-ai/agent-runtime`; `attemptFailure` (71) and `lastDiagnosticLine` (80), `launchNext` (182) call it during recovery. `ChatAgentFailurePort` is specified in `untangle/sheets/C6.md` §5; `agents-port.ts` does not exist in Jini at `02edbb68`. | C6 + R4-chat is a hard prerequisite of B1, not an option. One target shape: `RunFinalizerPorts.agents`, bound by Tovu to `chatAgentFailures`. B1's gate checks the executed closure. Practice 7 row corrected. |
| 8 | Minor | **Accepted, with listed exceptions** | First version: `RunTimerPort.schedule`, `RunLogPort.error/warn` and the two install methods had one parameter. | New port methods and the Phase C host methods take `(required, optional?: {})`. Zero-argument functions that are existing contracts stay; they are listed in 11 and put to the owner as OD-9. Practice 2 is marked "partly", not satisfied. |
| 9 | Minor | **Accepted and extended** | One pending write (518); retry keeps the old baseline (493-497, 557-569). `launch` awaits readiness first (213); `cancel` awaits origin lookup first (225); both await body cancel (222, 230). Extension: boot awaits `recover` per row (705), so an unbounded launch also delays chat routes. | 5.2 path K states the assumptions and the real bound. 5.5 separates request timeouts from whole operations. Path B's "5 s per row" corrected. C18 pins the stalled launch at boot. |
| 10 | Minor | **Accepted** | `assistant-chat-recovery.unit.test.ts:201-214` creates the coordinator without a recovery daemon, installs one, and asserts the prior-daemon probe and stream. | Summary point 5 corrected. C1 is that existing test, not a new one. C2 stays new: no test installs `onAttemptEnded` late (the only test with the hook passes it at construction). |

Blockers left: 0.
