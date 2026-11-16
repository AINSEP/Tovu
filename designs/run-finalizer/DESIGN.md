# Assistant run finalizer: split, one owner, host-bound ports (hard item #4)

Planning only. Nothing here was executed. Date 2026-11-16.
Code read: Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `integ/wave-b-r2` @ `02edbb68`.
Personas: software-architect (lead), refactor, programmer, tdd. Skills: implementation-guardrails, feature-slice-design, refactor-patterns, architecture-migration, hexagonal-architecture, testable-design-patterns, test-design.

Short names used below:
- **the file** = `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts` (Tovu).
- **the Jini copy** = `packages/chat/src/server/run-finalizer/{entry.ts,ports.ts}` (Jini).
- **recovery** = `createDurableRecovery` in Jini `packages/chat/src/server/durable-runs/recover.ts`.
- **ledger** = `ChatRunLedger` (Jini `packages/chat/src/core/durable-runs/ledger-contracts.ts`, built by `store/runtime/run-ledger.ts`).

## 0. Summary

1. The file is 809 lines and has 7 exports and one module-level `WeakMap`. It holds three different things: a daemon HTTP adapter (Tovu-only), a watch engine that follows a run and saves it (generic), and a per-ledger singleton (composition).
2. **Jini already has a finalizer** at `@jini-ai/chat/server/run-finalizer` (226 + 22 lines, 26 tests). It is an older fork of the same engine. Nothing imports it: not Tovu, not any Jini package or example. It lacks recovery, attempt bases, bounded resolution, size-based checkpoint cadence and checkpoint backoff. So there are two owners today, and the published one is the stale one.
3. Recommended split: the watch engine goes to Jini and **replaces** the Jini copy at the same path. Tovu keeps the HTTP adapter, the bindings (notices, run-id prefixes, `ps` child check, agent table, tracker, console) and the boot gating. The per-ledger `WeakMap` becomes an instance the composition root owns.
4. The work is three phases. Phase 0 adds characterization tests. Phase A splits the file inside Tovu along the generic/host line (7 commits, each green alone). Phase B moves the engine files to Jini. Phase C replaces the `WeakMap`. Phase A stands on its own if the owner rejects B or C.
5. Three behaviours are easy to break silently and have no test today: options read late after construction (§2.3), two eager snapshots at construction (§2.3), and the split between ref'd scheduler timers and the unref'd global checkpoint timer (§2.4).
6. Three suspected defects were found while tracing (§6). They are pinned by tests in Phase 0 and are not fixed by this refactor.
7. Estimate: about 1.6M Sonnet tokens and 90k Opus review (§9).

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
| Port call shape | one `args` object; `idle(args: Record<string, never>)` | `(required, optional)` |
| Scheduler port | `schedule` returns handle, `cancel({handle})`, `sleep` | `schedule({delayMs, run})` returns cancel |

The Jini copy cannot serve Tovu as it is, and the file's engine cannot stay next to it without being a second owner of the same behaviour.

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
| `options.recoveryDaemon`, `options.onAttemptEnded` | caller's object | `assistantRunFinalizerFor` (801-802), **after** construction | 384, 389, 397, 776, at call time | explicit late-bind methods (Phase C) |
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

Existing tests depend on this split: 6 files inject `scheduler`, and `assistant-run-finalizer.checkpoint-backoff.unit.test.ts` mocks global timers so trailing checkpoints never fire. A design that routes the trailing timer through `scheduler` changes both the tests and the idle-exit behaviour of the site process.

## 3. Generic vs host

**Generic, belongs in Jini `@jini-ai/chat/server/run-finalizer`:** R2 to R11. The engine knows a daemon only as a port, a ledger only as a port, and has no Tovu name, path, header, env var or copy except one English notice already duplicated in Jini (`"Stopped. Saved work is above."`: `recover.ts:12`, `run-ledger.ts` in `reconcileInterrupted`, and the file at 461).

**Host, stays in Tovu:**
- R1, the HTTP adapter. It imports five Tovu lifecycle modules and knows the principal header, the daemon registry file and park recovery.
- Bindings: `RUN_NOTICES` and the `byok:`/`agui:` prefixes (`contracts/core/assistant-run-events.ts`), `verifyAttemptChildDead` (`ps`), `agentCarriesOwnMemory` (agent table), `randomUUID`, the Node timers, the tracker, the console.
- Gating: only the serving composition calls `reconcileInterrupted` (`recoverInterrupted` option); export apps never do.
- Authorization: `ownedDurableRun` before `recover` (`assistant.ts:266,278`), the tenant-scoped store before `watch` (`assistant-chats.ts:277`).
- R12, as an instance owned by the composition root.

**Check against rule B1** (a Jini package imports only itself, core and protocol): the engine may import `chat/core/*`, `chat/server/durable-runs/*` and `@jini-ai/core/primitives` (`Clock`, already imported by the Jini copy). It may not import `@jini-ai/diagnostics` or `@jini-ai/sidecar`. So the tracker and the scheduler arrive as ports the chat package declares locally (B4: one consumer, declared in the consumer's `ports.ts`).

## 4. Target shape

### 4.1 Jini (after Phase B)

```
packages/chat/src/server/run-finalizer/
  ports.ts             RunDaemonClient, RunDaemonRequest, RunTimerPort, RunSpanPort, RunLogPort,
                       RunFinalizerPorts, RunFinalizerOptions, RunFinalizer          (types only, ~110)
  watch-state.ts       Watch, makeWatch, stopWatch, watchable, interruptionEvents             (~110)
  checkpoint-policy.ts approximateJsonBytes, checkpointGrew, hasUnsavedCheckpointGrowth       (~50, pure)
  checkpointer.ts      createCheckpointer(required) -> { onFrame, clear }                     (~150)
  stream.ts            createStreamReader(required) -> { read }                               (~70)
  bounded-follow.ts    createFollower(required) -> { follow }                                 (~190)
  recovery-binding.ts  createRecoveryBinding(required) -> { recovery, attemptEnded }          (~80)
  entry.ts             createRunFinalizer(ports, options = {}) -> RunFinalizer                (~140)
  __tests__/           ported engine tests (4.4)
packages/chat/src/testing/ (existing `@jini-ai/chat/testing` entry)
  run-finalizer-fakes.ts  fakeRunDaemon, manualRunTimers, recordingRunLedger (fakes of the ports)
```

Dependency direction: `entry -> recovery-binding, bounded-follow, checkpointer, stream, watch-state -> checkpoint-policy, ports`. Nothing in the folder imports `entry.ts`. `recovery-binding.ts` imports `../durable-runs/recover.js`. No file imports another Jini package except `@jini-ai/core/primitives`.

Signatures (required first, optional second, `= {}`):

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
/** Same call shape as sidecar's SupervisorScheduler, restated here (B4). */
export interface RunTimerPort { schedule(required: { delayMs: number; run: () => void }): () => void }
export interface RunSpanPort {
  trace<T>(required: { name: string; run: (span: { setOutcome(outcome: { status: RunWatchOutcome; error?: unknown }): void }) => T | Promise<T> },
           optional: { agent: { runId: string; conversationId: string } }): Promise<T>;
}
export type RunWatchOutcome = "succeeded" | "failed" | "canceled" | "interrupted" | "abandoned";
export interface RunLogPort {
  error(required: { operation: "checkpoint" | "watch"; runId: string; error: unknown }): void;
  warn(required: { operation: "attempt-cleanup"; runId: string; error: unknown }): void;
}
export interface RunFinalizerPorts {
  readonly ledger: Pick<ChatRunLedger, "durable" | "settle" | "checkpoint" | "reconcileInterrupted">;
  readonly daemon: RunDaemonClient;
  readonly clock: Clock;                       // @jini-ai/core/primitives
  readonly timers: RunTimerPort;               // deadlines and reconnect delays
  readonly checkpointTimers: RunTimerPort;     // trailing checkpoint timer (host unrefs it)
  readonly span: RunSpanPort;
  readonly log: RunLogPort;
  readonly notices: RunNotices;                // chat/core/run-events
  readonly isDaemonRunId: RunIdPolicy;         // chat/core/durable-runs/ports
  readonly mintRunId: () => string;
  readonly verifyChildDead: RecoveryPorts["verifyChildDead"];
  readonly supportsNativeResume: RecoveryPorts["supportsNativeResume"];
}
export interface RunFinalizerOptions {
  readonly reconnectDelayMs?: number; readonly maxReconnects?: number;
  readonly resolutionTimeoutMs?: number; readonly statusTimeoutMs?: number;
  readonly checkpointIntervalMs?: number;
}
export interface RunFinalizer {
  recover: DurableRecovery["recover"];
  reconcileInterrupted(required?: { now?: number }, optional?: {}): Promise<number>;
  watch(required: { principalId: string; conversationId: string; message: ChatMessage },
        optional?: { daemon?: RunDaemonClient; attemptBase?: AgentEvent[] }): void;
  idle(): Promise<void>;
  activeCount(): number;
  /** Explicit replacements for the mutated option cells (L1, L2). Last call wins, as today. */
  useRecoveryDaemon(required: { client: RunDaemonClient }): void;
  onAttemptEnded(required: { handler: (required: { runId: string }) => Promise<void> }): void;
}
```

Slice contracts (inputs, outputs, who owns the state):

| Slice | Inputs | Outputs | Owns | Hand-off |
|---|---|---|---|---|
| `checkpointer` | `ledger.checkpoint`, `clock`, `checkpointTimers`, `log`, `checkpointIntervalMs?` | `onFrame(watch)`, `clear(watch)` | the 7 `checkpoint*` fields, `trailing`, `checkpointState` on the `Watch` it is given | `stopWatch` calls `clear`; a late completion checks `watch.terminal` |
| `stream` | `notices` | `read(watch): Promise<StreamResult>` | `events`, `retainedEvents`, `frameCarry`, `failed`; sets `terminal` on an end frame | calls `checkpointer.onFrame` after each non-terminal frame |
| `bounded-follow` | `stream.read`, `clock`, `timers`, settings, `settle`, `recoverWatch`, `retainLive` | `follow(watch): Promise<RunWatchOutcome>` | `resolutionDeadline`, the reconnect counter | returns the outcome to the registry's span |
| `recovery-binding` | `ledger`, `clock`, `mintRunId`, both child ports, `currentDaemon`, `recoveryDaemon()` getter, `probe`, `attach` callback | `recovery?: DurableRecovery`, `attemptEnded({ runId })` | `newAttempts` | `attach` is a callback supplied by `entry.ts`; it is called only from `recover()` |
| `entry` | all ports | `RunFinalizer` | `active`, the two late-bound cells | reads `ledger.durable` once, here (E1) |

`recoveryDaemon()` is a getter so L1 stays a call-time read. `attach` is a closure over the returned object so L3 stays a call-time read.

### 4.2 Tovu (after Phase B and C)

```
apps/website/src/server/runtime/composition/
  jini-run-finalizer.ts            createAssistantRunFinalizer(options, _optional = {}): binds Tovu ports,
                                   calls Jini createRunFinalizer. Name follows untangle DESIGN §3 (`jini-<topic>.ts`). (~90)
  modules/run-daemon-http-client.ts   createHttpRunDaemonClient(required, optional = {})          (~130)
  modules/run-daemon-origins.ts       createRunDaemonOrigins(required, optional = {}) ->
                                      { origin, replayOrigin, retainLive, release, forget, current } (~90)
  shared-run-finalizer.ts          assistantRunFinalizerFor, unchanged; deleted in Phase C        (~25)
```

`jini-run-finalizer.ts` keeps today's option names (`now`, `scheduler`, `tracker`, `observability`, `daemon`, `recoveryDaemon`, `onAttemptEnded`, timing values) so the 10 test files and the one script that construct a finalizer with fakes change one import line and nothing else. It is wiring, not a forwarder: it adds the notices, the prefix policy, `verifyAttemptChildDead`, `agentCarriesOwnMemory`, `randomUUID`, the two timer ports, the span adapter and the console adapter.

### 4.3 Port bindings checked for behaviour, not only for types

| Port | Engine expects | Tovu supplies today | Binding | Difference to guard |
|---|---|---|---|---|
| clock | `Clock.nowMs()` | `now?: () => number` | `{ nowMs: options.now ?? Date.now }`; recovery gets `() => clock.nowMs()` | none; one read per call as today |
| `timers` | `schedule({ delayMs, run })` returns cancel | `SupervisorScheduler`, same keys | pass through; default `createNodeSupervisorScheduler({})` | ref'd timers; unchanged |
| `checkpointTimers` | same shape | global `setTimeout` + `unref()` | `{ schedule: ({ delayMs, run }) => { const t = setTimeout(run, delayMs); t.unref(); return () => clearTimeout(t); } }`, reading the global at call time | tests that mock global timers still intercept it; `scheduler` fakes still do not see it |
| `span` | one `trace` signature with `agent` options | `Tracker.trace` (3 overloads in `diagnostics/src/observability/tracker-types.ts`) | pass `tracker` if `tsc` accepts the overload against the single signature; otherwise `{ trace: (required, optional) => tracker.trace(required, optional) }` | **not verified with `tsc`**; decide at dispatch |
| `log` | `error({ operation, runId, error })`, `warn(...)` | three `console` calls (558, 765, 778) | adapter that prints the same three strings, with `describeErrorForLog` on the cleanup warning only | text and arguments must stay byte-identical (test `failed credential release records only its error class and code`) |
| `notices` | `RunNotices` object | `RUN_NOTICES` bound inside Tovu wrappers | pass `RUN_NOTICES` | engine calls Jini `translateRunFrame({ kind, raw, notices }, { carry })`; Tovu's wrapper takes `{ kind, raw }` |
| run events | `runContentFromEvents({ events })`, `runEventsForSave({ events })`, `readSseFrames({ body })` | Tovu wrappers take a **positional** array / stream | engine calls the Jini owners directly | positional to object: every call in the moved code changes (11 calls on lines 447, 448, 456, 474, 531, 532, 591, 600) |
| `isDaemonRunId` | `({ runId }) => boolean` | Tovu wrapper binds `excludedPrefixes` | pass Tovu's `isDaemonRunId` | none |
| `daemon` | `RunDaemonClient` as in 4.1 | same type, moved | pass through | `release`'s optional type loosens from `Record<string, never>` to `{}`; no caller passes a value |
| `ledger` | `Pick<ChatRunLedger, 4 members>` | Tovu `ChatRunLedger` is the Jini type (`run-ledger.ts:10`) | pass through | `durable` read once (E1) |
| child ports | recovery's signatures | `verifyAttemptChildDead(required, {})`, `agentCarriesOwnMemory({ agentId }, {})` | same lambdas as 400-401 | none |

## 5. Correctness

### 5.1 What makes each path safe today

| Property | Mechanism | Where |
|---|---|---|
| A terminal row is written once | `ledger.settle` changes a row only if it still has this `runId` and is not terminal | Jini `run-ledger.ts` |
| A late checkpoint cannot reopen a row | same guard in `ledger.checkpoint`, plus `watch.terminal` checked before and after the write | 518, 567 |
| A stale attempt cannot write | recovery advances `run_id` by CAS (`store.advance`); every later write carries the old id | Jini `recover.ts` `continueDead` |
| One continuation per decision | `expectedRunId` check, reload after every await, CAS | Jini `recover.ts` `recover`, `reload` |
| A replay cannot shrink the saved answer | `retainedEvents` and the growth rule | 470-476, 585, 524 |
| An end frame is never stuck behind a slow save | one pending checkpoint, never awaited by the frame loop | 607, 517 |
| A dropped stream is not a death | probe the owning daemon; only 404 is `dead`; anything else is `uncertain` | 382-386, 682-686 |
| A live quiet run is never killed by a timer | `readWithinBound` renews the deadline on a fresh 200 | 621-639 |
| Launch is idempotent | `idempotencyKey: run.runId` | 218 |

### 5.2 Crash at every step

"Crash" is the API process dying. The daemon may survive (it is detached). After a crash only boot repair acts: `assistant-chats.ts:114` calls `reconcileInterrupted`, which calls `recover({ trigger: "boot" })` per unfinished row.

**Path S, stream end:** S1 end frame read, S2 `stopWatch`, S3 `ledger.settle`, S4 cleanup (release pin, `onAttemptEnded`, `active.delete`).

| Crash point | Left on disk | Repair |
|---|---|---|
| before S3 commits | row `running`, last checkpoint (at most one interval old) | daemon alive and still has the run: 200, reattach, replay from 0, settle. Daemon gone: 404, treated as a dead attempt, **a new attempt is launched** although the run had finished (F3) |
| after S3 commits | terminal row | none needed; boot discovery selects only `queued`/`running` |
| S3 rejects (storage error) | row `running` | the watch ends as `abandoned` and leaves `active`; nothing retries until a browser call or the next boot (F2) |

**Path K, checkpoint:** K1 compute, K2 mark pending and stamp time, K3 `ledger.checkpoint`, K4 update baselines on `true`, K5 clear pending and reschedule on growth.

| Crash point | Left on disk | Repair |
|---|---|---|
| before K3 commits | previous checkpoint | boot repair; at most one interval of progress lost |
| after K3 commits | new checkpoint | same; in-memory baselines die with the process |
| K3 rejects | previous checkpoint | retry after `max(interval, 1 s)`; no retry on a `false` result |

**Path R, hand-off:** R1 choose events, R2 `stopWatch`, R3 full `ledger.checkpoint`, R4 delay `reconnectDelayMs`, R5 `recovery.recover({ expectedRunId })`.

| Crash point | Left on disk | Repair |
|---|---|---|
| before or after R3 | row `running` | boot repair |
| R3 rejects | row `running` | the error leaves `follow`; R5 never runs (F2) |
| during R4 | row `running` | a browser `recover` or a new `watch` may run meanwhile; `expectedRunId` and the CAS decide |

**Path D, continuation (Jini `continueDead`):** D1 cancel old attempt (errors ignored), D2 mint id, D3 `store.advance` CAS, D4 reload, D5 launch, D6 `recoveryClock`, D7 attach.

| Crash point | Left on disk | Repair |
|---|---|---|
| after D3, before D5 | new `run_id`, `queued`, nothing launched | boot: 404. Within 10 s of `attemptStartedAt` it waits and re-probes every `reconnectDelayMs`; after that it continues again and spends one more of the 3 recoveries |
| after D5, before D7 | daemon is running the new attempt | boot: 200, reattach |
| D5 rejects or times out | diagnostic checkpoint `run_launch_unconfirmed` | the attached watch probes the same idempotent attempt |

**Path X, cancel:** X1 `store.cancel`, X2 `recover`, X3 cancel attempt on daemon, X4 settle `canceled`. A crash after X1 leaves a cancel reason on a `running` row; boot repair reaches X3 and X4 through the same exclusion check. Repeating X1 to X4 is safe.

**Path B, boot:** rows are handled one after another, and chat routes wait for the whole pass (`assistant-chats.ts:128-130`). Each stalled probe costs up to `statusTimeoutMs` (5 s), so N unfinished rows with an unreachable daemon delay chat by up to 5 N seconds. Recorded as a cost, not changed.

### 5.3 Concurrency with a live run

- A second `watch` for a run already watched is a no-op (716). A watch that has stopped but not yet cleaned up is replaced; the old cleanup deletes `active` only if the entry is still its own (779) and releases the pin only if no successor shares the client (775).
- A browser `recover` while a watch is live: 200 gives `reattached` and `attach` is the no-op above. A 404 advances the attempt; the old watch's later writes are rejected by the ledger, its own `recover({ expectedRunId })` returns `superseded`, and it ends.
- Two `recover` calls for one dead attempt: one wins the CAS, the other returns `superseded` after its reload.

### 5.4 Clock and timeouts

Defaults: reconnect delay 2 s, 30 reconnects, 120 s without live proof, 5 s per status probe, checkpoint 1/3/10 s, checkpoint retry at least 1 s. Recovery: 3 recoveries, 5 min window, 30 min staleness, 10 s launch grace.
- Deadlines are computed from `now()` and waited through the scheduler. A forward clock jump (laptop sleep) makes the deadline fire at once; the probe then decides, so a live run is renewed.
- `launch` (10 s) and `cancel` (5 s) use `AbortSignal.timeout` on the real clock. A fake clock cannot advance them. They stay in the Tovu adapter.

## 6. Suspected defects found while tracing (pin, do not fix here)

None was reproduced by running code. Each gets a Phase 0 test that records today's behaviour; a fix is a separate red-first change.

| Id | Suspicion | Trace |
|---|---|---|
| F1 | `newAttempts.delete(runId)` (770) runs in the old watch's cleanup even when a successor watch for the same run id is live. After that, `cancelAttempt` and `probe` for a new attempt choose `recoveryDaemon`. With a surviving previous daemon and no pinned origin, `cancel` goes to the previous daemon, which does not hold the attempt, so the fence is missed and a continuation can start while the attempt still runs. The ledger CAS still protects the saved row; tool side effects are not protected. | 384, 397, 770; client `cancel` at 224-231, `origin()` at 161-167 |
| F2 | A storage rejection in `settle` (442) or in `recoverWatch`'s checkpoint (456) ends the watch with the row still `running`. Nothing watches it again until a browser request or a restart. | 442, 456, 762-766 |
| F3 | A run that finished but was not yet settled when the API died is continued as a new attempt if the daemon is also gone, because a 404 is the only death signal and the saved events carry no end marker. | 5.2 path S |

## 7. Migration

Commands (real ones; none was run in this session, no install was done):
- Tovu, one file: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks <file>` (from `package.json:39`). Gates: `npm run typecheck`, `npm run check:size`, `npm run check:complexity`, `npm run check:boundaries`.
- Jini: `pnpm install && pnpm -r build` first (Tovu consumes `dist`), then `npm --prefix packages/chat run test`, `pnpm typecheck`, `pnpm guard`.

The finalizer test set for "green" in every Tovu step is the 15 files in 1.3. Test count rule (honest-testing): 109 call sites before; after Phase B the sum of Tovu and Jini call sites that came from these files is 109 plus the Phase 0 additions. The 26 tests of the Jini copy are counted separately in B1.

### Phase 0: characterization (Tovu, no production change)

One commit, new file `apps/website/src/server/__tests__/assistant-run-finalizer.characterization.unit.test.ts` plus `...crash-matrix.integration.test.ts`. Prerequisite: none. Fakes: a `RunDaemonClient` object, a `SupervisorScheduler` object with manual firing, a `now` counter, `node:test` mock timers for the global timer, and the real in-memory chat database for the crash matrix (the ledger's guards are the thing under test there).

| Test | Asserts | Fails when (the mutation that proves it) |
|---|---|---|
| C1 late `recoveryDaemon` | create via `assistantRunFinalizerFor` without it, install it with a second call, then boot-recover a row: the probe goes to the installed client | `const { recoveryDaemon } = options` at construction |
| C2 late `onAttemptEnded` | same pattern; handler runs when a watch ends | same mutation for `onAttemptEnded` |
| C3 `previousDaemon` snapshot | called exactly once before the constructor returns; never again across 3 requests | make the call lazy inside `origin()` |
| C4 `ledger.durable` read once | a counting getter reads 1 after construction and 1 after two watches; a ledger whose `durable` is `undefined` at construction never recovers | read `options.ledger.durable` inside `recoverWatch` |
| C5 timer split | with an injected scheduler and mocked global timers: a skipped frame arms 1 global timer and 0 scheduler entries; the timer handle is unref'd; a dropped stream arms 1 scheduler entry | route `scheduleCheckpoint` through `scheduler` |
| C6 deadline edges | at `deadline - 1` no probe; at `deadline` one probe; at reconnect `maxReconnects - 1` retry, at `maxReconnects` recover with trigger `timeout` | `>=` to `>` at 685; `===` to `>` at 652 |
| C7 effect order at watch end | recorded order is: stream aborted, `release`, `onAttemptEnded`, `active` empty; a throwing handler still empties `active` | reorder the `finally` block; drop the inner `finally` |
| C8 same-client successor | start a second watch for the run during the first one's recovery delay; first cleanup does not call `release` and does not remove the successor | remove the `successor` check at 775 or the identity check at 779 |
| C9 `newAttempts` lifetime (F1) | records which client receives `cancel` for a new attempt after its first watch was replaced | change line 770 to delete only when no successor exists (test then shows the other client) |
| C10 settle rejection (F2) | row stays `running`, `activeCount()` is 0, a later `watch` adopts it and settles | add a retry inside `settle` |
| C11 crash matrix | for each crash point in 5.2 (S before/after, K before/after, R before/after, D after-advance and after-launch, X after-cancel): stop finalizer 1 at that port call, build finalizer 2 on the same database, run `reconcileInterrupted`, assert final status, content, number of launches, number of attempts | remove the terminal guard (late checkpoint reopens), remove `expectedRunId` (two launches), skip the reload after CAS (launch on a canceled row) |
| C12 finished-but-unsettled (F3) | crash before S3 with the daemon gone: exactly one new launch, same message id | treat 404 as terminal success |
| C13 concurrent recover | two `recover` calls for a dead attempt: one launch, results `continued` and `superseded` | drop the reload in recovery `decide` |
| C14 boot order and bound | 3 unfinished rows, all probes stalled: handled in message-id order, total scheduler time at most `3 x statusTimeoutMs`, routes answer only after | parallelize the loop; remove `withinDeadline` from `probe` |
| C15 public surface | the module exports exactly the 7 names in 1.1 and the finalizer has exactly 5 methods | any accidental export or method |

Crash injection for C11: wrap the ledger and the daemon client in a proxy that, at the chosen call, throws a marker error and makes every later call from finalizer 1 reject. "After commit" points let the real call finish and throw on return. This is a fake of the port interfaces; no module is mocked.

### Phase A: split inside Tovu (behaviour unchanged)

Prerequisite for all: Phase 0 merged and green. Each commit runs the 15 files plus the Phase 0 files, `typecheck`, `check:size`, `check:complexity`.

| Commit | Change | Callers and tests updated in the same commit | Green alone because |
|---|---|---|---|
| A1 | Move `RunDaemonRequest`, `RunDaemonClient`, `daemonHeaders`, `createHttpRunDaemonClient` to `modules/run-daemon-http-client.ts`. No re-export from the old file. | `assistant.ts:84`, `assistant-chats.ts:35`; tests: `http-client.unit`, `observability`, `chat-recovery.unit`, `chat-recovery-bounds.unit`, `assistant-daemon-connection.test`, and every test importing `type RunDaemonClient` (7 files). Re-key the `createHttpRunDaemonClient#1` size-debt entry to the new path. | pure move; the finalizer imports the type from the new file |
| A2 | Extract `createRunDaemonOrigins` (`origin`, `replayOrigin`, `retainLiveOrigin`, `release`, `current`) to `modules/run-daemon-origins.ts`; `previous` and `initialToken` stay read in the client factory body before anything else (E2, E3). Every function at most 50 lines; remove the size-debt entry. | none | C3 guards the snapshot; the 12 client tests guard origin choice |
| A3 | Create `modules/run-finalizer/`: `watch-state.ts` and `checkpoint-policy.ts` receive the module-level helpers and `Watch`. | none (not exported) | pure move of functions that close over nothing |
| A4 | `checkpointer.ts`: `createCheckpointer({ ledger, now, checkpointTimers, log, checkpointIntervalMs })`. The factory in the old file passes a `checkpointTimers` object built from global `setTimeout` + `unref`, and a `log` object that calls `console.error` with today's string. | none | C5 and the 16 backoff tests |
| A5 | `stream.ts` and `bounded-follow.ts`. `settle`, `recoverWatch` and `retainLive` are passed in as functions. | none | reconnect-pin (8), bounds (7), C6 |
| A6 | `recovery-binding.ts` owns `newAttempts`; the registry calls `attemptEnded({ runId })` at the same point as line 770. `recoveryDaemon` is passed as `() => options.recoveryDaemon`. | none | C1, C9, `adopted watches use the recovery daemon...` |
| A7 | `entry.ts` holds `createAssistantRunFinalizer` (assembly, `active`, `startWatch` with the cleanup split into `endAttempt`, so cyclomatic complexity is at most 10) and `shared.ts` holds `assistantRunFinalizerFor` unchanged. Delete `assistant-run-finalizer.ts`. Replace the two `Record<string, never>` optionals (76, 645). | the 4 production importers, the 15 test files, `measure-site-memory.mjs:649`, the comment in `extraction-dossier.mjs`; remove the remaining 2 size-debt entries and the complexity entry | C15 (surface), all 109 |

After A7: largest file about 190 lines; every function at most 50 lines; no entry for these paths in either debt file.

### Phase B: engine to Jini (needs owner decision OD-1)

| Commit | Repo | Change | Prerequisites | Green alone because |
|---|---|---|---|---|
| B1 | Jini | Replace the Jini copy's `entry.ts` and `ports.ts` with the files of 4.1 (from Tovu `modules/run-finalizer/`, with the 4.3 call-shape changes). Port the engine tests to vitest. Delete the copy's 26 tests only where a ported test covers the same statement; list each deleted test and its replacement in the commit body. Add `STOPPED_NOTICE` to `core/durable-runs/policies.ts` and import it in the engine. Update `knip.json:223`, `scripts/size-debt.json:591`, add fakes to `@jini-ai/chat/testing`. | Phase A done. Untangle lane **R4-chat** and **C6** edit `server/durable-runs/recover.ts` (row 390 of `LANES-files.tsv`); B1 does not edit that file, but if R4/C6 land first, `RecoveryPorts` gains the agents port and `recovery-binding.ts` must pass it through. | no Jini consumer exists; `pnpm guard` proves the folder imports only chat and core |
| B2 | Tovu | Add `composition/jini-run-finalizer.ts` (4.2). Delete every file under `modules/run-finalizer/` (the engine now lives in Jini; `shared.ts` moves beside the binding until Phase C). Engine-behaviour tests leave Tovu only if B1 ported them (same titles); wiring, HTTP-client and real-database tests stay. Regenerate Jini `host-callers.json` and `caller-ledger.csv` rows. | B1 built (`pnpm -r build`) and the Jini version Tovu resolves contains it | 15 Tovu files (fewer tests, each accounted for) plus Phase 0 |

Test homes after B: Jini owns checkpoint cadence/backoff, stream replay, bounded resolution, reconnect pins, span outcomes (about 50 of the 109; the exact list is fixed when B1 is dispatched). Tovu keeps `http-client.unit`, `assistant-daemon-connection`, `chat-recovery.unit`, `checkpoint-route`, `chats-skill-title`, `launch-cause`, `restart`, `durable-finalizer`, `failed-run.integration`, `desktop-assistant-admission`, the crash matrix, and C1 to C4. The Jini copy's own doc comment already says real-database restart coverage is the host's job.

### Phase C: composition owns the instance (needs OD-2)

| Commit | Change | Prerequisites |
|---|---|---|
| C-1 | `RouteDeps` gains `assistantRuns: () => AssistantRunFinalizer` (memoized, lazy so a test that never touches chat does not open the database, E1). Built beside `chatRunLedger` at `deps.ts:2333` and `app.ts:1299`. 8 test files assign `chatRunLedger` by hand and need the field. | size design 01 (composition deps) decides the file that holds the `chatRunLedger` line; land after it or re-point |
| C-2 | The 4 production callers use `deps.assistantRuns()`. `assistant-chats.ts` calls `useRecoveryDaemon`, `assistant-byok.ts` calls `onAttemptEnded`. Delete `shared.ts` and the `WeakMap`. Tests that called `assistantRunFinalizerFor` (3 files) read `deps.assistantRuns()`. | size design 02 moves `registerSiteIdlePark` (`app.ts:2030`) to `public-middleware.ts`; whichever lands second edits the moved line |

## 8. Interaction with other plans

| Plan | Overlap | Order |
|---|---|---|
| Untangle R4-chat + C6 | `chat/server/durable-runs/recover.ts` loses its `@jini-ai/agent-runtime` import and gets an agents port | independent of Phase A. B1 must be rebased on whichever is merged; B2's binding supplies the agents port |
| Untangle C0 gate (`L5-injected-edge`) | new engine files in chat must add no debt | B1 adds zero non-base imports; the Jini copy's one import (`Clock`) is already compliant (`EDGES-sites.tsv:349`) |
| Daemon R7 (routes to `ServerRoute[]`) | `/api/runs`, `/api/runs/:id`, `/events`, `/cancel` are what the Tovu HTTP adapter calls | paths and status codes must not change; R7's judge finding on `/api/runs` vs `/api/runs/:runId/events` precedence is the same contract the adapter relies on. No file overlap |
| Daemon R8 (runtime ports) | none in files; `agent-session-preset.ts` (source of `agentCarriesOwnMemory`) wraps `@jini-ai/daemon/session-coordination` | if R8 changes that helper's signature, only the lambda in `jini-run-finalizer.ts` changes |
| Size design 01 (composition deps) | Phase C adds one `RouteDeps` field | C-1 after 01 |
| Size design 02 (composition app) | `registerSiteIdlePark` moves; `createAssistantChatsModule` wiring at `app.ts:2385` | A7 changes one import in `app.ts`; if 02 lands first the import lives in `public-middleware.ts` |
| Untangle Q8 / Q1 (Node adapters to host preset) | the Node timer defaults and `ps` check are bound in Tovu, not in a Jini domain package | compliant; if the owner wants the Jini `server` preset to offer a default finalizer, that is new work, not part of this design |

## 9. Estimate (Sonnet tokens unless marked)

| Phase | Tokens |
|---|---|
| 0 characterization (15 tests, crash harness) | 250k |
| A1-A7 | 480k |
| B1 (engine port, about 50 tests to vitest, fakes) | 450k |
| B2 | 180k |
| C-1, C-2 | 200k |
| Opus review of Phase 0 tests and of B1 | 90k Opus |
| **Total** | **about 1.56M Sonnet + 90k Opus** |

Phase 0 + A alone: about 730k.

## 10. Owner decisions

| # | Question | Recommendation |
|---|---|---|
| OD-1 | Engine home. (a) Move to Jini, replacing the stale copy at the same export. (b) Delete the Jini copy and keep the engine in Tovu. | (a). It is generic, Jini already publishes the slot, and recovery's `attach`/`probe` ports have no in-package counterpart otherwise. (b) costs about 100k instead of 630k and still ends the two-owner state. |
| OD-2 | Shared instance. (a) `RouteDeps.assistantRuns()` and explicit `useRecoveryDaemon` / `onAttemptEnded`. (b) Keep the per-ledger `WeakMap` as a recorded exception to practice 1. | (a). |
| OD-3 | Timers. (a) Keep two ports so the trailing checkpoint timer stays unref'd and outside `scheduler`. (b) One port with a `keepAlive` flag. | (a) now; (b) changes when the process may exit and needs its own tests. |
| OD-4 | `runStatus` returns an HTTP status number. Keep, or change to `"live" / "missing" / "unknown"`? | Keep in this refactor. 15 test files pass numbers; the mapping (404 dead, 200 live, else uncertain) would move into the adapter and need its own characterization. |
| OD-5 | Practice 9 exceptions found: unredacted `console.error(..., error)` at 558 and 765; errors turned into `null`/`dropped`/`undefined` without a record at 204, 254, 430, 622 and in recovery's `cancelAttempt(...).catch`. Fix inside this refactor or after? | After, red-first. The log port introduced in A4 is where the fix goes. |
| OD-6 | F1, F2, F3 (§6): pin now and fix later, or fix first? | Pin now. F1 and F2 are small and worth fixing right after Phase A; F3 needs a design (a durable end marker). |
| OD-7 | Jini `@jini-ai/chat/server/run-finalizer` changes its exported API in B1 (factory name, ports). It is published in 0.7.1 with no known consumer. | Accept as a breaking change in the next 0.x release note. No alias for the old name (practice 5). |

## 11. Practices check

| # | Practice | Status in the target | Conflict or exception |
|---|---|---|---|
| 1 | DI, typed ports, no global or singleton | Engine receives 12 ports. Tovu binds them in one file. | Until Phase C the `WeakMap` stays (OD-2). `fetch` and `setTimeout` are read as globals only inside Tovu adapters. |
| 2 | `(required, optional = {})`, never `?: Record<string, never>` | All new signatures follow it. | Two existing `Record<string, never>` optionals (76, 645) fixed in A7. `Tracker` in Jini diagnostics has the same pattern; not in scope. |
| 3 | Functions at most 50 lines, files at most 500, complexity at most 10 | Largest file about 190; the two long factories and the complexity-11 callback are split. | `checkpoint` is about 47 counted lines today; it is split into "decide" and "write" in A4 to leave margin. Counts are from reading, not from the lint tool. |
| 4 | Feature slicing by responsibility | 8 engine files, one responsibility each (4.1 table). | none |
| 5 | No barrels, shells, forwarders, aliases | Old path deleted in A7; old Jini API deleted in B1; callers repointed. | `jini-run-finalizer.ts` is wiring with 8 bindings, not a forwarder. |
| 6 | Why-comments move with code | The header comment (7-33) goes to `entry.ts`; each function's comment moves with it; the Tovu-specific paragraph ("Why finalization stays in the API") stays in `jini-run-finalizer.ts`. | Comments that cite Tovu report paths are reworded in Jini without the path. |
| 7 | Generic to Jini, one-site to Tovu; package imports only itself, core, protocol | Engine in chat imports chat and `@jini-ai/core/primitives`. | `recover.ts` still imports `@jini-ai/agent-runtime` until R4/C6 (existing debt, not added). |
| 8 | Tests use fakes of interfaces from `/testing`; characterization first | Phase 0 first. Engine tests use port fakes from `@jini-ai/chat/testing`. | Tovu's crash-matrix and restart tests use the real chat database and the real Jini ledger on purpose: the guard under test lives there. They are host integration tests. |
| 9 | Errors never swallowed or generic; logs redacted | Unchanged by this refactor. | OD-5 lists the existing exceptions. `launch` throws `continuation rejected (${status})`, which is plain but has no pasteable detail. |
| 10 | No new `eslint-disable` / `@ts-ignore`; no silent behaviour change | None planned. | The three timing reads in §2.3 and the timer split in §2.4 are the places a silent change would happen; C1 to C5 guard them. |
| 11 | Smallest change, reuse first, no abstraction with one user, reversible | Reuses recovery, ledger, run-events, checkpoint policy. Each phase can stop. | `RunTimerPort`, `RunSpanPort`, `RunLogPort` each have one implementation in Tovu; they exist because B1 forbids the direct import, not for variation. |
| 12 | Memory and IO cost on hot paths | No change: one open stream, one pending checkpoint, one trailing timer per run; `approximateJsonBytes` avoids a second serialization. | Boot repair is sequential and gates chat routes (5.2 path B): up to 5 s per unfinished row when the daemon does not answer. |

## 12. Not verified

- No test, typecheck or lint was run. Line counts per function are from reading the file and the debt JSON.
- Whether `Tracker` (overloaded `trace`) is assignable to the single-signature `RunSpanPort` (4.3).
- The single-transaction behaviour of `ledger.checkpoint` and `ledger.settle` was taken from their doc comments; only `reconcileInterrupted` was read in full.
- F1, F2, F3 are from code reading only.
- `assistant-daemon-client.ts` (`daemonFetch`, `fetchAgentDaemon`) was not compared with the HTTP adapter for shared logic; a merge of the two is not proposed.
- `LESSONS-FOR-DESIGN-BRIEFS.md` on `plan/size-designs-2026-11-16` contains 11 rules, not 15.
- Whether `policies.ts` is in any untangle lane's file list (B1 adds one constant to it).
- Size designs 01 and 02 were searched for overlaps by keyword, not read in full.
