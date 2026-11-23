DESIGN COMPLETE

> **R1123 revision (Opus, Software Architect role, `AI-Dev-Shop/agents/software-architect/skills.md` re-read 11-23):** every P3 item Codex marked NEEDS in `reviews/plans1123.md` is revised **in place**; each changed paragraph is tagged **R1123**. Summary: J1–J2 ownership is a **fenced lease** (generation token, checked in claim, manual insert, `preparing`/`starting`/`started` admission, settlement, renew and release; passive acquisition split from `start()`; revision rechecked after the awaited handler; manual insert result checked before `prepare`; legacy types unchanged → minor). T1 eligibility comes from full launch admission; `enable` skips overdue slots even within grace; a pending beacon is published before any raising DB commit. T2 uses caller-supplied ids, persists principal + message identity at claim, keeps a retryable interruption obligation keyed by message identity, passes `model` through the sanitized context. T3 pins durable open/answer/expiry events with ordered, ref-bound transitions. T4–T5 pass `{ emitSurface }` as the second argument, bind the confirmed action, defer update/run-now tools, add resume confirmation and availability-vs-transport classification. D1 now names the daemon→site tool hop. New invariants I38–I57.

# ALGO-P3 · Routines — algorithm design (HOW each step works)

**For:** Codex logic review before any code. **Implements:** `plans/P3-routines.md` (step ids kept) with the corrections in `reviews/check-P3-P4-P5.md` (P3 table) applied.
**Bases (re-verified 11-23):** Tovu `origin/integ/merge-13-2026-11-22` = `f7185f153a`, Jini `origin/integ/merge-14-2026-11-22` = `4902a6a1a`. `W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`, `D/` = Tovu `apps/desktop/src/`, `J/` = Jini `packages/`.
**Author context:** Software Architect role (`AI-Dev-Shop/agents/software-architect/skills.md` loaded); design only, no production code.
**Owner rules applied everywhere:** inject everything (clock, timers, ids, DB, logger, run starter); hooks as props; Jini vendor- and server-framework-neutral (routes are `defineJsonRoute` specs the host mounts); no package above domains; functions ≤ 80 lines, complexity ≤ 10 (split points named per step); no re-export shells; approval card for every routine mutation; plain-language errors. Owner memory rule: **a missed run runs once on reopen and says so.**

## Summary

| step | operations designed | invariants | open owner questions |
|---|---|---|---|
| P3-J1 | arm, timer fire, claim-due-slot, catch-up classify, reconcile (`start`/`wake`/`enable`), stale-timer fence, one-active-run fence, boot reconcile of in-flight runs, lease heartbeat, stop | I1–I10 | OWNER-Q1 (skipped slot visibility), OWNER-Q2 (catch-up after assistant re-enable) |
| P3-J2 | schema ensure/migrate, create, get, list, update, set-enabled, delete (soft), listRuns, claimDueSlot txn, setNextRunAt, insertManualRun, updateRun, markInterrupted, lease acquire/renew, history prune; HTTP create/update/delete/run-now with reasons | I11–I17 | OWNER-Q3 (does pause stop the in-progress run) |
| P3-T1 | host composition gate, routine DB open/close, service lifecycle (boot, assistant on/off, site stop), admin route mount, beacon write, desktop boot-start of eligible sites, wake relay | I18–I21 | OWNER-Q4 (= plan Q1, which sites start on open) |
| P3-T2 | handler (pure ids) → claim → prepare (conversation + turn) → start (acceptance) → settle; agent/model resolution; interrupted-before-chat-recovery ordering | I22–I26 | OWNER-Q5 (= plan Q3, BYOK), OWNER-Q6 (Codex as routine agent before the 400 s fix) |
| P3-T3 | approval observer: open → waiting, answer → approved/declined, expiry/abandon → expired, quit → interrupted | I27–I30 | OWNER-Q7 (= plan Q2, approval across quit) |
| P3-T4 | `routine_create` / `routine_list` / `routine_set_enabled` / `routine_delete`: parse → card → re-validate → command; stale-revision refusal; visibility | I31–I34 | — |
| P3-T5 | list query + polling, row projection, form submit, pause/resume/delete with ConfirmDialog, deep link select | I35–I37 | — |

## 0. Bases and verified anchors

Jini (merge-14):
- `J/daemon/src/routines/types.ts:9` `RoutineRunStatus`, `:15` `RoutineSchedule`, `:31` `Routine`, `:47` `RoutineRun`, `:62` `RoutineRunHandlerStart` (`prepare`/`start`/`discard`/`discardUnstarted`), `:95` `RoutineRunHandler`, `:118` `RoutinePersistence` (sync: `list`, `insertRun`, `updateRun`, `getLatestRun`).
- `J/daemon/src/routines/scheduler.ts:92` `RoutineService`; `:114` `start`; `:126` `rescheduleAll`; `:154` `scheduleRoutine` (always `nextRunAtForSchedule(now)` → no catch-up); `:168` `scheduleRoutineAt` (raw `setTimeout`, delay clamped 1 s … 2e9 ms, `unref`); `:237` `claimRunRow`; `:255` `persistPreparedIds`; `:353` `start_` (`inflight` map covers only the start phase, **not** the whole run).
- `J/daemon/src/routines/routine-store.ts:60` `RoutineStore` (async CRUD + `listRuns`/`getLatestRun`), `:145` `createInMemoryRoutineStore`. Unmerged `codex/ex2-holds-jini` edits only its doc comments (`@jini-ai/sqlite-chat` → "a SQLite store") — no behavior conflict; carry the new wording.
- `J/daemon/src/routines/schedule.ts:251` `nextRunAtForSchedule`, `:315` `validateSchedule`, `:278` `isValidTimezone`.
- `J/daemon/src/http/routines.ts:89` `RoutineScheduler`, `:91` `RoutineHttpDeps`, `:283` list, `:294` create, `:308` get, `:317` update, `:334` delete, `:354` run-now, `:382` runs, `:401` `routineRoutes`.
- `J/daemon/src/scheduler.ts` `SchedulerPort` / `createTimeoutScheduler` (injected timer port with idempotent cancel; reused here).
- `J/core/src/contracts/storage/sqlite.ts:65` `SqliteDb` (= `SqliteSyncClient`, has `transaction(...).immediate`).
- `J/daemon/src/store/event-log/sqlite.ts:25,53` borrowed-handle pattern; `sqlite-policy.ts` `schemaSetup: 'ensure' | 'host'` and exported DDL constant; `J/daemon/package.json:19` entries map + `:86` exports block for `./store/event-log/sqlite`.
- `J/chat/src/server/durable-runs/accept.ts:15` `createRunAcceptance` — `accept({principalId, workspaceId, conversationId, messageId, request:{agentId?, contextRef}})`; **idempotent per message** (store returns the existing run) and commits before `launch`.
- `J/core/src/surface-exchanges.ts:19` `SURFACE_EXCHANGE_ID_PARAM`, `:84` `SurfaceMessage` (`received`/`expired`/`abandoned`); `J/daemon/src/surface-exchanges.ts:104` `initialSurfaceDeadlines` (leased → infinite), `:128` lease test `lifetime.principalId === binding.principalId`. Unmerged `ex5-fnd-inject-jini` only removes `AssistantSurfaceDeps` from this file (moves to Core) — no lease change.
- `J/daemon/src/agent-executor/codex/home-config.ts:48` `CODEX_TOOL_TIMEOUT_SEC = 400`, used `:32,46,71,85`.

Tovu (merge-13):
- Site server owns acceptance: `W/server/runtime/composition/modules/assistant.ts:175` `proxyAcceptedRun` (Express `res`; forwards `agentId`, no model), `:182` `createHttpRunDaemonClient({…},{ensureReady: deps.assistantDaemonDemand?.ensureReady})`, `:93` `assistantDaemonDemand`. `W/assistant/durable-runs/accept.ts:5` wraps Jini acceptance with the host `sanitizeContextRef`.
- Chat store seam: `W/server/runtime/composition/modules/assistant-chats.ts:100` `storeFor` → `deps.chatHistory({kind:'user', workspaceId, userId})`.
- Daemon side: `W/server/inbound/assistant/agent-daemon-scope.ts:124` `createSiteScope`, `:188` per-scope idle park (`isBusy: surfaceExchanges.size() > 0`); shared host `agent-daemon-server.ts:22` `scopedExchanges`, `:191` shared idle park, `:248–256` standalone scope binding. `agent-daemon-run-start.ts:116` `createRunStartHandler`.
- Daemon demand from the site server: `W/server/runtime/lifecycle/daemon-supervisor.ts:745` `ensureAssistantDaemonReady` (single-flight 30 s discovery).
- Desktop ownership proof: `W/server/runtime/boot/local-owner-signin.ts:47–55` `classifyLocalOwnerLaunch` (`desktopLaunch`, `desktop` capability check), `:61` parent-pid check, `:111` env scrub. `D/tovu-server.ts:500` sets `TOVU_DESKTOP_OWNER_PID`.
- Desktop: `D/desktop-agent-service.ts:228` `ensureSiteReady`, `:349` `createDesktopAgentService`; `D/main/boot/site-backend.ts:100` `createSiteBackend`, `:148` `startSiteBackend`. No `powerMonitor` anywhere in `D/` (grep empty). Unmerged `ex4-desktop-tovu` edits `D/main/index.ts` (+12/−9) — bind Electron events **after** it lands.
- Site-private sidecar DB pattern: `W/server/runtime/composition/site-deps/database-journal.ts:22–32` (separate connection under `ops/` beside `content.db`, closed via `onStoreClose`).
- Approvals: `W/contracts/core/human-confirm.ts:108` `requireHumanConfirm` (needs `emitSurface`; opens a run-bound exchange). Metadata shape `W/contracts/core/tool-metadata/publish-content.ts:47,57` (`confirmation: 'direct'` vs `'policy'`). Unmerged `ex5-fnd-inject-tovu` moves generic metadata to `@jini-ai/core/tool-metadata/*` and `ToolApprovalPolicy` to `@jini-ai/core/contracts/site/tool-metadata-approval-policy`; product metadata stays in `W/contracts/core/tool-metadata/*.ts` → **routine metadata is product copy and stays in Tovu**; import `ToolApprovalPolicy` from wherever it lives when T4 starts.
- Registration: `W/assistant/tool-registrations.ts:495` `buildAssistantToolRegistrations`; `W/contracts/core/tool-metadata/index.ts:70` `nativeToolMetadata`; `W/server/runtime/composition/tool-catalog-manifest.ts` (contribution manifest; `ex5-collections-tovu` edits it — rebase).
- Admin: `A/panels.tsx:185–187` `ai-assistant` panel with `allowedQueryParams: {"tab": null}`; `A/hooks/use-assistant-chats.hooks.ts:22` `select` on the controller type, `:67` stable forwarding.

## 1. Cross-cutting design decisions (Codex: check these first)

**D1 — The scheduler lives in the desktop-launched site server process, not in the agent-daemon scope.** The plan said "bind in `createSiteScope`". Rejected because: (a) the daemon is shared across sites, demand-started and idle-parked (`agent-daemon-server.ts:191`); a scheduler there either pins it awake forever (defeats P8-T5) or dies on park; (b) a daemon scope exists only after a demand, so nothing would exist to fire the first slot; (c) everything a fire needs is already in the site server: the routine owner's principal, the chat history store (`assistant-chats.ts:100`), durable acceptance (`assistant.ts:175`), admin routes, and `ensureAssistantDaemonReady` (`daemon-supervisor.ts:745`), which wakes a parked or not-yet-started daemon on demand, so a slot can fire before any daemon exists. The site server lives until the owner stops the site or quits Tovu. The daemon only needs to stay awake while a run is active (P8-T5).
**R1123 correction (Codex P3 preamble): there *is* a process hop for tools.** HTTP routes and timers call `RoutineCommands` in-process in the site server, but assistant tools execute in the daemon, whose executor routes every non-local tool back to the site server (`agent-daemon-scope-tools.ts:137–145`: `createRoutingToolExecutor({ local, remote: siteTools.remote, isLocal: registry.has })`). Routine tools are therefore registered as **site tools** (not daemon-local), so the existing authenticated site-tool path carries them to the site server's `RoutineCommands`. That hop must preserve two things, each with a named test in T4: the run's **principal** (`ctx.principal.id` on the site side equals the daemon run's principal) and the **approval emitter** (`emitSurface` reaches `requireHumanConfirm` on the site side, so the card opens on the run's conversation). STOP rule: if `siteTools.remote` cannot forward `emitSurface`, the builder names the file:line and stops before T4 (no fallback to a daemon-local routine tool, which would need a cross-process command port).

**D2 — Durable `nextRunAt` is the single source of truth for "which slot is next".** In-memory timers are a cache of it. Every fire is a compare-and-swap on it. Catch-up is "the stored slot is in the past by more than the grace".

**D3 — Approval state is separate from run status.** A run waiting for approval is `status = 'running'`, `approval_state = 'waiting'`. Decline is a fact about one approval; the run may still finish normally.

**D4 — New generic status `interrupted`** joins `RoutineRunStatus` (Jini). Meaning: the process that owned the run went away before the run settled. Never retried.

**D5 — Desktop boot uses a per-site beacon file** (hint, not authority) to decide which stopped sites to start in the background (owner Q1 recommendation), so the main process never opens a site's DB.

---

## P3-J1 · Jini · durable due slot + catch-up

### 1. Data model
- Types (`J/daemon/src/routines/types.ts`, owner Jini):
  - `RoutineRunStatus` += `'interrupted'`.
  - `RoutineRun` += `catchUp: boolean` (default `false`), `slotAt: number | null` (scheduled slot this run consumed; `null` for manual), `approvalState: 'none' | 'waiting' | 'approved' | 'declined' | 'expired'` (default `'none'`), `approvalRef: string | null`, `approvalSince: number | null`.
  - `Routine` += `revision: number`, `creatorId: string`, `model: string | null` (J2 persists them; J1 only reads `nextRunAt`, `enabled`).
  - New opt-in port `RoutineDurablePersistence extends RoutinePersistence` (sync, because better-sqlite3 is sync — keeps the existing sync rationale at `types.ts:102–117`). **R1123 (Codex J1–J2): ownership is a fenced lease. Every mutating method takes the caller's `fence` and its SQL checks the fence inside the same `IMMEDIATE` txn; a stale fence fails closed with `'fence-lost'`. Wall clock decides only *when another process may try* to take over (liveness); the generation decides *who may write* (safety).**
    ```ts
    type RoutineFence = { readonly holderId: string; readonly generation: number };
    type LeaseHolderView = { holderId; generation; expiresAt; pid; processStartedAt; bootId };
    type FenceLost = { ok: false; reason: 'fence-lost' };
    readLease(): LeaseHolderView | null;
    acquireLease(a: { holderId; now; ttlMs; proof: { pid; processStartedAt; bootId }; provenDead?: { holderId; generation } })
      : { ok: true; fence: RoutineFence } | { ok: false; reason: 'held'; holder: LeaseHolderView };
    renewLease(a: { fence; now; ttlMs }): { ok: true } | FenceLost;
    releaseLease(a: { fence }): void;
    claimDueSlot(a: { fence; routineId; expectedNextRunAt: number; expectedRevision: number; nextRunAt: number | null; run: DurableRoutineRun })
      : { claimed: true } | { claimed: false; reason: 'slot-moved' | 'changed' | 'disabled' | 'gone' | 'active-run' | 'fence-lost' };
    insertManualRun(a: { fence; routineId; expectedRevision: number; run: DurableRoutineRun })
      : { ok: true } | { ok: false; reason: 'active-run' | 'changed' | 'gone' | 'fence-lost' };
    admitPhase(a: { fence; runId; phase: 'preparing' | 'starting' | 'started' }): { ok: true } | { ok: false; reason: 'fence-lost' | 'not-running' };
    settleRun(a: { fence; runId; patch: RoutineRunTerminalPatch }): boolean;        // fenced terminal write
    setNextRunAt(a: { fence; routineId; expected: number | null; nextRunAt: number | null }): boolean;   // CAS + fence
    listInFlight(a: { fence }): DurableRoutineRun[];                                  // status running/queued AND holder_generation < fence.generation
    markInterrupted(a: { fence; runIds: readonly string[]; now }): number;           // sets interrupt_pending=1 when phase ∈ starting|started
    listInterruptPending(a: { fence }): DurableRoutineRun[];
    clearInterruptPending(a: { fence; runId }): boolean;
    ```
    Feature-detected once in the constructor with `isDurablePersistence(p)` (`typeof p.claimDueSlot === 'function'`) and stored as a strategy object. Legacy in-memory path keeps `insertRun(…, {scheduledSlotAt})` unchanged.
  - **Type compatibility (Codex J1–J2 "preserve legacy type compatibility or release a major"):** `RoutineRunStatus` and `RoutineRun` stay **byte-for-byte unchanged**. New additive types `DurableRoutineRunStatus = RoutineRunStatus | 'interrupted'` and `DurableRoutineRun = Omit<RoutineRun,'status'> & { status: DurableRoutineRunStatus; catchUp; slotAt; approvalState; approvalRef; approvalSeq; phase; principalId; userMessageId; assistantMessageId; routineRevision }`. Only the durable port and the SQLite store use them → `@jini-ai/daemon` **minor**. Type test `routine-status.compat.test-d.ts`: an exhaustive `switch` over legacy `RoutineRunStatus` still typechecks. Mutation: add `'interrupted'` to the legacy union → `tsc` red. (OWNER-Q P3-8 if the owner prefers one widened type + major.)
- `RoutineService` constructor optional seams (second object): `now`, `newId`, `timers: SchedulerPort` (default `createTimeoutScheduler({})`), `log: RoutineDiagnostics` (`{ warn(code, fields), error(code, fields) }`, default console), `holderId` (default `newId()`), `holderProof` (required on the durable path: `{ pid, processStartedAt, bootId }` from the host), `isHolderDead: (v: LeaseHolderView) => boolean` (host port; default `() => false` = never claims proof of death), `graceMs` (60 000), `maxArmMs` (300 000), `leaseTtlMs` (90 000), `leaseRetryMs` (default `leaseTtlMs / 3`).
- In-memory state (per service): `armed: Map<routineId, { gen; slotAt; cancel }>`, `gen: Map<routineId, number>` (monotonic), `active: Map<routineId, runId>`, `started: boolean`, **`mode: 'passive' | 'active'`**, **`fence: RoutineFence | null`**, `heartbeatCancel`, `retryCancel`, `pendingReason: 'start' | 'enable'`.

### 2. Algorithm
Constants: `GRACE = graceMs` (60 s), `MAX_ARM = maxArmMs` (5 min).

**A. `start({ reason = 'start' })`** — R1123: acquisition is split out so a retry never hits the `started` early return (Codex J1–J2).
1. If `started` return. Set `started = true`, `mode = 'passive'`, `pendingReason = reason`.
2. Legacy persistence → `reconcile({reason})` and return (old behavior). Durable → `tryAcquire()` (A′).

**A′. `tryAcquire()`** — the retry target; guarded by `started && mode === 'passive'`, **never** by the `started` flag alone.
1. If `!started || mode === 'active'` return.
2. `view = readLease()`. `provenDead = view && view.holderId !== holderId && isHolderDead(view) ? { holderId: view.holderId, generation: view.generation } : undefined` (host proof = same machine, `pid` absent or `processStartedAt` differs; never a clock comparison).
3. `res = acquireLease({ holderId, now: now(), ttlMs: leaseTtlMs, proof: holderProof, provenDead })` (J2: takeover when the row is absent, expired, or `provenDead` still matches the row; **every takeover writes `generation + 1`**).
4. `held` → `log.warn('ROUTINES_LEASE_HELD', { holderId: res.holder.holderId })`; `retryCancel = timers.schedule({ delayMs: leaseRetryMs, callback: tryAcquire })`; return.
5. `ok` → `fence = res.fence`; `mode = 'active'`; `reconcileInFlight()` (B); `await drainInterruptObligations()` (B′); `reconcile({ reason: pendingReason })` (C); `pendingReason = 'start'`; arm heartbeat every `leaseTtlMs / 3`.

**A″. heartbeat** → `renewLease({ fence, now, ttlMs })`; `fence-lost` → `enterPassive('ROUTINES_LEASE_LOST')`. Then `drainInterruptObligations()` (retries obligations that returned `retry`).

**A‴. `enterPassive(code)`** → `log.error(code)`; `mode = 'passive'`; `fence = null`; bump every `gen`; cancel every armed timer and the heartbeat; schedule `tryAcquire` after `leaseRetryMs`. In-process runs keep their objects, but every later `admitPhase`/`settleRun` they attempt carries the dead fence and fails closed (the new holder owns them).

**B. `reconcileInFlight()`** — a previous holder (older generation) died or was fenced out mid-run.
1. `runs = listInFlight({ fence })` — SQL selects `holder_generation < fence.generation`, so this process's own runs are never included (replaces the old `holder_id != me` test, which a re-used holder id defeats).
2. `markInterrupted({ fence, runIds, now })` in one txn. For rows whose `phase ∈ ('starting','started')` the same UPDATE sets `interrupt_pending = 1` (a chat attempt may exist). `approval_state 'waiting' → 'expired'`.
3. Never re-run them; `nextRunAt` untouched.

**B′. `drainInterruptObligations()`** (Codex T2: retryable obligation)
1. For each `run` in `listInterruptPending({ fence })`: `outcome = await onInterrupted({ run })` (host hook, T2: cancel the chat attempt **by durable message identity**, returns `'canceled' | 'retry'`, never throws — a throw is mapped to `'retry'`).
2. `'canceled'` → `clearInterruptPending({ fence, runId })`. `'retry'` → keep; retried on the next heartbeat and on the next boot.
3. Invariant: `interrupt_pending` is cleared **only** after the cancel is durable in the chat store; marking Interrupted and setting the obligation are one UPDATE, so no crash order can lose it (I39).

**C. `reconcile({reason})`**, `reason ∈ 'start' | 'wake' | 'enable' | 'edit'`:
1. For each `r` in `persistence.list()`: bump `gen[r.id]`, cancel `armed[r.id]`.
2. `decision = classifySlot({routine: r, now, grace, reason})` (pure):
   - `!r.enabled` → `idle`.
   - `r.nextRunAt == null` → `seed` (compute `next = nextRunAtForSchedule(now)`).
   - `r.nextRunAt > now` → `arm(r.nextRunAt)`.
   - `reason === 'enable'` (OWNER-Q2 rec) → `skip` (advance without running). **R1123 (Codex T1): tested before the grace branch, so a resume 10 s after a missed slot still skips it.**
   - `now - r.nextRunAt <= GRACE` → `fire({catchUp: false})`.
   - else → `fire({catchUp: true})`.
3. Apply: `seed` → `setNextRunAt({expected: null, nextRunAt: next})` then arm; `skip` → `setNextRunAt({expected: r.nextRunAt, nextRunAt: nextRunAtForSchedule(now)})` then arm; `fire` → `fireSlot(r.id, r.nextRunAt, catchUp)` (E); `arm` → `arm(r.id, slotAt)` (D).

**D. `arm(routineId, slotAt)`**
1. `g = ++gen[routineId]`.
2. `delay = clamp(slotAt - now(), 1_000, MAX_ARM)` (the 5-minute cap replaces the 2e9 ms cap and bounds clock-jump error).
3. `cancel = timers.schedule({delayMs: delay, callback: () => onTimer(routineId, slotAt, g)})`; `armed.set(routineId, {gen: g, slotAt, cancel})`.

**E. `onTimer(routineId, slotAt, g)`**
1. If `!started || gen[routineId] !== g` → return (stale fence, I3).
2. `t = now()`. If `t < slotAt` → `arm(routineId, slotAt)` and return (early wake from the 5-min cap or a backwards clock jump).
3. `catchUp = (t - slotAt) > GRACE` (a timer delayed by sleep is catch-up; 20 ms jitter is not, I2).
4. `fireSlot(routineId, slotAt, catchUp)`.

**F. `fireSlot(routineId, slotAt, catchUp)`** → `start_(routineId, 'scheduled', {scheduledSlotAt: slotAt, catchUp})`. Then `.then/.catch` → `rearmFromStore(routineId)` (reads persisted `nextRunAt`; never recomputes from `now` when a stored value exists — the plan's mutation target). `ScheduledRunPersistenceError` keeps the existing retry-same-slot behavior, but with backoff `min(60 s, 2^attempt s)` and max 5 attempts per slot, then `log.error('ROUTINE_SLOT_PERSIST_FAILED')` and rearm from store.

**G. `start_` durable path** (R1123: fenced at every admission; Codex J1–J2):
1. If `active.has(routineId)` → manual: throw `RoutineActiveError` (HTTP 409 `ROUTINE_RUN_ACTIVE`); scheduled: fall through (claim consumes the slot with `active-run`, I5).
2. `mode !== 'active'` → manual: throw `RoutinesUnavailableError('other-window')`; scheduled: return (no fence, no claim).
3. `routine = list().find(...)`; missing → `Routine not found`. Capture `rev = routine.revision`, `myFence = fence`.
4. `handlerStart = await handler({routine, trigger, startedAt, runId, catchUp, slotAt})` — **effect-free** (mints ids only).
5. **After the await:** `if (fence !== myFence)` → `discardUnstarted`, return (lost the lease while awaiting). Build `run` (`status:'running'`, `phase:'claimed'`, `holderGeneration: myFence.generation`, `principalId: routine.creatorId`, the handler's pre-minted `conversationId/userMessageId/assistantMessageId`, `routineRevision: rev`).
6. Scheduled: `next = nextRunAtForSchedule({schedule}, {now: new Date(max(now(), slotAt + 1))})`; `res = claimDueSlot({ fence: myFence, routineId, expectedNextRunAt: slotAt, expectedRevision: rev, nextRunAt: next, run })`. `claimed:false` → `discardUnstarted`; `active-run` → `log.warn('ROUTINE_SLOT_SKIPPED_ACTIVE')`; `changed` → `rearmFromStore` (the slot was **not** consumed, so it fires again with the edited routine); `fence-lost` → `enterPassive`. Return without preparing (I4).
   Manual: `res = insertManualRun({ fence: myFence, routineId, expectedRevision: rev, run })`. **`ok:false` → `discardUnstarted` and throw the mapped error (`active-run` → 409 `ROUTINE_RUN_ACTIVE`; `changed` → 409 `ROUTINE_CHANGED`; `gone` → 404; `fence-lost` → 503 `ROUTINES_LEASE_HELD`). `prepare` is never reached** (Codex: "check manual insert success before prepare").
7. `active.set(routineId, runId)`.
8. `admitPhase({ fence: myFence, runId, phase: 'preparing' })` → refused → `active.delete`, `discardUnstarted`, return. Else `await prepare(run)` → `persistPreparedIds` (fenced). On throw → `finalizeUnpreparedRun` via `settleRun` (fenced) + `active.delete`.
9. `admitPhase({ fence: myFence, runId, phase: 'starting' })` — refused → `active.delete`; `discard()` (T2 tombstones the assistant message so no later `accept` can launch it, I38). This is the last check before the external effect; the residual window between this commit and the acceptance call is closed by T2's message tombstone, not by time.
10. `wireRunCompletion` → on settle: `settleRun({ fence: myFence, runId, patch })` **then** `active.delete(routineId)`. A `false` (fenced out or already terminal) → `log.warn('ROUTINE_SETTLE_FENCED')`; nothing else is written (I40).
11. `startPreparedRun` (unchanged); T2 calls `admitPhase('started')` with the accepted `agentRunId`.

**H. `pause/edit/delete` hooks** — CRUD commits first (J2; CRUD is owner data, not lease-fenced, but bumps `revision` so an in-flight claim captured before the edit refuses with `changed`), then the caller invokes `rescheduleOne({routineId})` = bump gen, cancel armed, re-read row, `classifySlot` with `reason: 'edit'`. In passive mode it only bumps gen (nothing is armed).

**I. `stop({})`** → `started = false`; `mode = 'passive'`; bump every gen; cancel all armed, heartbeat and `retryCancel`; `releaseLease({ fence })` (fenced: a fenced-out process cannot release the new holder's lease); `fence = null`. Active runs are **not** awaited here (host decides, T1-C).

**Split points (≤ 80 lines, complexity ≤ 10 each):** `classifySlot` (pure), `applySlotDecision`, `arm`, `onTimer`, `fireSlot`, `rearmFromStore`, `reconcile`, `reconcileInFlight`, `drainInterruptObligations`, `tryAcquire`, `enterPassive`, `heartbeat`, `claimScheduledSlot` (G6), `insertManual` (G6), `admitAndPrepare` (G8), `admitStart` (G9), `startDurable_` vs existing legacy `start_` body (strategy object chosen once in the constructor).

### 3. State machine — routine slot (per routine, durable)
`disabled (next=null)` —enable→ `armed(next=S)` —timer/reconcile at t≥S, claim wins→ `armed(next=S')` + run row; —claim loses→ re-read; —pause→ `disabled`; —delete→ `deleted` (terminal). `armed(S)` with `t−S > GRACE` at start/wake → one catch-up fire → `armed(S' > t)`.

Run (`RoutineRun.status`): `running` —completion→ `succeeded | failed | canceled` (terminal); `running` —prepare throws→ `failed`; `running` —owner process gone (B)→ `interrupted` (terminal). `queued` is unused by the durable path (kept for the legacy contract).

### 4. Concurrency + crash safety
- **Claim atomicity:** CAS on `next_run_at = expected AND enabled = 1 AND deleted_at IS NULL` + run insert + `next_run_at` advance in **one `BEGIN IMMEDIATE`** (J2). Two timers, two windows, a wake reconcile and a timer, or two processes: exactly one `changes = 1`.
- **Stale timers:** `gen` fence in memory (I3) + CAS on durable slot (pause sets `next = null`, so even an un-fenced timer loses the claim).
- **One active run:** in-memory `active` + DB partial unique index `(scope, routine_id) WHERE status IN ('queued','running')` (I5).
- **Crash windows** (durable path):

| died between | state on disk | next process does |
|---|---|---|
| handler() and claim | nothing | normal reconcile; slot fires (catch-up if > grace) |
| claim commit and prepare | run row `running`, placeholder ids, next advanced | B marks it `interrupted`; no re-run; next slot stays |
| prepare (conversation created) and `persistPreparedIds` | conversation exists; run row has T2's pre-minted ids (T2 mints ids in the handler, so the row already links it — I23) | B marks `interrupted`; link works |
| start() (accepted) and completion | chat run accepted; routine row `running` | B marks `interrupted` and `onInterrupted` cancels the chat run before chat recovery (I24) |
| completion write | terminal row | nothing |
- **Two processes / two profiles / a suspended former holder (R1123):** the lease row carries a monotonic `generation`. Takeover (row absent, `expires_at <= now`, or host-proven death of the exact `{holderId, generation}` observed) always writes `generation + 1`. Every write a holder makes — claim, manual insert, `admitPhase('preparing'|'starting'|'started')`, `setNextRunAt`, `settleRun`, `clearInterruptPending`, `releaseLease` — includes `EXISTS (SELECT 1 FROM jini_routine_leases WHERE scope=:scope AND holder_id=:holder AND generation=:gen)` in the same txn. A holder that was suspended (laptop lid, debugger, SIGSTOP) past its TTL wakes with a stale generation and **every** write refuses; its in-memory timers fire but its claim fails `fence-lost` → `enterPassive`. Clock jumps change only *when* takeover is attempted, never whether two holders can both write (I38, I41).
- **The one non-transactional edge — acceptance:** after `admitPhase('starting')` commits, the old holder may pause before calling acceptance. The new holder's `markInterrupted` sets `interrupt_pending` for that `starting` row and its obligation drain tombstones the assistant message in the chat run store (T2 B′). When the old holder resumes, `accept` finds a terminal run for that message and does **not** launch (Jini acceptance requirement, T2 §4, test `accept never launches a message whose run is already terminal`).
- **Clock changes:** forward jump → timer still fires within ≤ `MAX_ARM`; lateness > grace → labeled catch-up (correct: the wall slot was missed). Backward jump → `onTimer` sees `t < slotAt` and re-arms (no early fire). DST: `schedule.ts` already DST-safe; next slot always computed with `now = max(now(), slotAt + 1)` so a backward jump can't recompute the same slot (I6).
- **Sleep/wake:** Node timers fire late after wake → `onTimer` classifies catch-up by itself; host `reconcile({reason:'wake'})` is an accelerator; both race through the CAS → one run (I7).

### 5. Failure modes and limits
| failure | handling | plain words (shown where) | id path |
|---|---|---|---|
| claim write throws (`SQLITE_BUSY` after busy_timeout 5 s, `SQLITE_FULL`) | `ScheduledRunPersistenceError`, retry same slot, backoff 1,2,4,8,16 s (max 5) | "A routine could not start because Tovu couldn't save to disk. It will try again." (admin row error) | `ROUTINE_SLOT_PERSIST_FAILED` diagnostic; HTTP surfaces through the host reporter (P4) as `ERR-…` |
| handler throws pre-claim | rearm from store; nothing persisted | — (diagnostic only) | `ROUTINE_HANDLER_FAILED` |
| prepare throws | row `failed`, `error` plain | T2 supplies the plain text | `ROUTINE_PREPARE_FAILED` |
| lease held by another live process | passive | "Routines for this site are running in another Tovu window." (list `availability`) | `ROUTINES_LEASE_HELD` |
| lease lost | `stop` | same as above | `ROUTINES_LEASE_LOST` |
Limits: ≤ 1 armed timer per routine; arm delay ≤ 5 min; reconcile O(n) routines per start/wake; no busy loop (min delay 1 s).

### 6. Invariants → named tests (in `routines/__tests__/scheduler.test.ts` / `scheduler.f1.test.ts` / new `scheduler.durable.test.ts`, fake clock + fake `SchedulerPort`)
- **I1** Restart after k ≥ 1 missed slots fires exactly once with `catchUp: true` and stores the first slot strictly after now. Test: `restart after three missed slots fires once with catchUp and schedules the next future slot`. Mutation: compute the next slot from `now` on boot and ignore the stored value → red (no fire).
- **I2** A timer up to `GRACE` late is not catch-up. Test: `20 ms late timer is not catch-up`. Mutation: `catchUp = t > slotAt`.
- **I3** A timer armed before pause/edit/stop never claims. Test: `paused routine's old timer does nothing`. Mutation: drop the `gen` check (CAS still saves durability → assert also that `claimDueSlot` was **not called**).
- **I4** A claim loser creates no conversation and starts nothing. Tests: `lost claim reloads and does not run`, `claim loser creates no conversation` (handler spy: `prepare`/`start` never called, `discardUnstarted` called once). Mutation: call `prepare` before checking `claimed`.
- **I5** At most one active run per routine; a due slot during an active run is consumed without a second run. Test: `pending run across the next slot consumes it without a second run`. Mutation: remove the `active-run` branch from the CAS (DB index then throws → test expects no throw and no second row).
- **I6** After a backward clock jump no slot fires twice. Test: `clock set back one hour re-arms and does not refire the same slot`.
- **I7** Wake + late timer race fires once. Tests: `wake reconcile fires once; a second wake does not`, `late timer and wake reconcile race produce one run`.
- **I8** Boot reconciles persisted in-flight runs to `interrupted` before evaluating active runs, and never re-runs them. Test: `crash after claim records Interrupted and keeps the next slot`. Mutation: skip B → the next slot is blocked by the stale active row (red).
- **I9** Legacy (non-durable) persistence behaves byte-for-byte as before. Test: existing `scheduler.test.ts` suite unchanged and green.
- **I10** `enable` reconcile does not catch up (pending OWNER-Q2), **even within grace**. Tests: `re-enabling the assistant skips overdue slots without running`, `Resume inside grace does not fire a missed slot` (slot at T, assistant re-enabled at T+10 s, grace 60 s → 0 runs, `next_run_at` advanced). Mutation: test `now - next <= GRACE` before `reason === 'enable'` → 1 run → red.
- **I38 (R1123)** `Suspended former holder cannot prepare or launch after takeover` (`scheduler.durable.test.ts`, one temp-file DB, two `RoutineService` handles A/B with independent fake clocks): A claims; A's `prepare` is paused on a deferred; B's clock jumps `ttl + 1`; B acquires (generation 2), marks A's run `interrupted`; release A → A's `admitPhase('starting')` is refused, its `start`/`acceptOwnerChatRun` spies are called 0 times, its settle writes nothing. Mutations: (a) drop the `generation = :gen` predicate from `admitPhase` → A launches → red; (b) takeover without `generation + 1` → A's fence still matches → red.
- **I39 (R1123)** `Passive handle takes over after the holder's lease ends`: A holds; B starts passive; A stops renewing; B's retry timer fires → B active and arms. Mutation: route the retry through `start()` (early `started` return) → B never active → red.
- **I40 (R1123)** `Late settlement from a fenced-out holder does not overwrite interrupted` and `Edit during the awaited handler refuses the stale claim and fires with the new revision`. Mutations: drop the fence from `settleRun`; drop `expectedRevision` from `claimDueSlot` (run uses the old prompt) → red.
- **I41 (R1123)** `Manual run refused for an active routine never prepares` (`insertManualRun` → `active-run`; `prepare` spy 0, HTTP 409). Mutation: ignore the insert result (old G5) → `prepare` called → red.
- **I42 (R1123)** `Death-based takeover requires the observed holder row unchanged`: `isHolderDead` true for generation 3 but the row is now generation 4 (holder renewed after a pid-reuse false positive) → acquire refuses. Mutation: omit the `provenDead.generation` predicate → takeover of a live holder → red.

### 7. Wiring
- Ports: `RoutineDurablePersistence` (Jini, `routines/types.ts`), `SchedulerPort` (Jini `J/daemon/src/scheduler.ts`), `RoutineDiagnostics` (new, `routines/types.ts`), clock/newId functions. Host passes the J2 adapter's `persistence`, `holderId = <site server boot id>`, and `onInterrupted` (T2).
- Must not import: `node:timers` directly in `scheduler.ts` (use the port), any `@tovu/*`, `express`, `better-sqlite3`, `electron`.
- Changeset: `@jini-ai/daemon` **minor** — additive durable types (`DurableRoutineRunStatus`, `DurableRoutineRun`, `RoutineFence`, `RoutineDurablePersistence`); legacy `RoutineRunStatus`/`RoutineRun` unchanged (compat type test, §1). If the owner chooses OWNER-Q P3-8 "one widened type", it becomes a **major** with an exhaustive-consumer note.

### 8. Open choices
- **OWNER-Q1:** When a slot is skipped because the previous run of the same routine is still going, should the admin screen show it? **Recommend no row** (history stays one row per real run); a diagnostic is logged. A visible "Skipped" row would teach owners that long routines silently miss slots, but adds noise for hourly routines.
- **OWNER-Q2:** If the owner turns the assistant off and back on, do missed slots catch up? **Recommend no** — turning the assistant off is deliberate, unlike sleep or quit (the owner rule covers "reopen"). Pause/resume of one routine likewise never catches up.

---

## P3-J2 · Jini · SQLite routine store + CRUD contract

### 1. Data model
New `J/daemon/src/routines/routine-store.sqlite.ts` (≤ 80-line functions; DDL + SQL text in `routine-store.sqlite-schema.ts`), node-only subpath `./routines/sqlite` (`package.json` `jini.entries` + `exports`, mirroring `:19,86`; `runtime: node`). Borrowed `SqliteDb`; never closes it, never changes pragmas (host sets `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`).

Migration name **`jini-routines-v1`**, recorded in its own table (the DB is borrowed, so `PRAGMA user_version` is not ours):
```sql
CREATE TABLE IF NOT EXISTS jini_routine_schema (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS jini_routines (
  scope        TEXT    NOT NULL,
  id           TEXT    NOT NULL,
  name         TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  prompt       TEXT    NOT NULL CHECK (length(prompt) BETWEEN 1 AND 8000),
  schedule     TEXT    NOT NULL,             -- JSON RoutineSchedule, validated before write
  target       TEXT    NOT NULL,             -- JSON RoutineProjectTarget
  skill_id     TEXT, agent_id TEXT, model TEXT,
  context      TEXT    NOT NULL DEFAULT '{}',
  creator_id   TEXT    NOT NULL,             -- immutable after insert (no UPDATE statement sets it)
  enabled      INTEGER NOT NULL CHECK (enabled IN (0,1)),
  next_run_at  INTEGER,                      -- NULL iff disabled/deleted/schedule exhausted
  revision     INTEGER NOT NULL DEFAULT 1,   -- +1 on every CRUD write (not on claim)
  created_at   INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at   INTEGER,
  PRIMARY KEY (scope, id)
);
CREATE INDEX IF NOT EXISTS idx_jini_routines_live ON jini_routines (scope, created_at, id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS jini_routine_runs (
  scope TEXT NOT NULL, id TEXT NOT NULL, routine_id TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual','scheduled')),
  status  TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','canceled','interrupted')),
  phase   TEXT NOT NULL DEFAULT 'claimed' CHECK (phase IN ('claimed','preparing','starting','started')),  -- R1123: how far toward the external effect
  catch_up INTEGER NOT NULL DEFAULT 0, slot_at INTEGER, holder_id TEXT NOT NULL,
  holder_generation INTEGER NOT NULL,                                     -- R1123: fence of the writer that claimed it
  interrupt_pending INTEGER NOT NULL DEFAULT 0 CHECK (interrupt_pending IN (0,1)),  -- R1123: chat attempt must still be canceled
  routine_revision INTEGER NOT NULL,                                      -- R1123: revision the run was built from
  principal_id TEXT NOT NULL,                                             -- R1123 (Codex T2): persisted before launch
  user_message_id TEXT NOT NULL, assistant_message_id TEXT NOT NULL,     -- R1123: durable message identity, pre-minted
  project_id TEXT NOT NULL, conversation_id TEXT NOT NULL, agent_run_id TEXT NOT NULL,
  agent_id_used TEXT, model_used TEXT,
  started_at INTEGER NOT NULL, completed_at INTEGER,
  summary TEXT, error TEXT, error_code TEXT,
  approval_state TEXT NOT NULL DEFAULT 'none' CHECK (approval_state IN ('none','waiting','approved','declined','expired')),
  approval_ref TEXT, approval_since INTEGER, approval_seq INTEGER NOT NULL DEFAULT 0,   -- R1123 (Codex T3): last applied event seq
  PRIMARY KEY (scope, id),
  FOREIGN KEY (scope, routine_id) REFERENCES jini_routines (scope, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_jini_routine_runs_slot   ON jini_routine_runs (scope, routine_id, slot_at) WHERE slot_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_jini_routine_runs_active ON jini_routine_runs (scope, routine_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_jini_routine_runs_history ON jini_routine_runs (scope, routine_id, started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_jini_routine_runs_pending ON jini_routine_runs (scope) WHERE interrupt_pending = 1;

CREATE TABLE IF NOT EXISTS jini_routine_leases (
  scope TEXT PRIMARY KEY, holder_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),                    -- R1123: fencing token, +1 on every takeover
  expires_at INTEGER NOT NULL,
  holder_pid INTEGER NOT NULL, holder_started_at INTEGER NOT NULL, holder_boot_id TEXT NOT NULL  -- evidence for host death proof
);
```
**Fence predicate** (string constant `FENCE_OK`, appended to every holder write): `EXISTS (SELECT 1 FROM jini_routine_leases l WHERE l.scope = :scope AND l.holder_id = :holder AND l.generation = :gen)`.
Factory: `createSqliteRoutineStore({ db, scope }, { now, newId, holderId, schemaSetup = 'ensure', historyLimit = 100 })` → `{ store: RoutineStore; persistence: RoutineDurablePersistence }` — **two adapters over one set of prepared statements** (Codex J2: `RoutineStore` is async, `RoutinePersistence` sync). Exported `SQLITE_ROUTINES_SCHEMA` for host-managed migration (mirror `sqlite-policy.ts`).
`RoutineCreateInput` += `model?: string | null`, required `creatorId` is **not** part of the input — it is a second-object field supplied by the trusted caller: `store.create(required, { ...optional, creatorId })`. `RoutineUpdateInput` += `model?`, `expectedRevision?` (in the optional object of `update`/`delete`).

### 2. Algorithm (every write = one `db.transaction(fn).immediate()`)
- **ensureSchema:** if `schemaSetup === 'host'` → `SELECT 1 FROM jini_routine_schema WHERE name='jini-routines-v1'`, absent → throw "routine store schema missing". Else `exec(SQLITE_ROUTINES_SCHEMA)` + `INSERT OR IGNORE` the name.
- **create(required, optional):** `validateSchedule`, `validateTarget`, name/prompt bounds → txn: `next = enabled ? nextRunAtForSchedule(now) : null`; `INSERT … revision=1`. Return row + `lastRun: null`.
- **get / list:** `WHERE scope=? AND deleted_at IS NULL` (list ordered `created_at, id`, max 200 rows — owners have few routines; >200 → `ROUTINES_LIMIT` on create). `lastRun` = one indexed query per routine via `idx_jini_routine_runs_history LIMIT 1` (n ≤ 200).
- **update({id, patch}, {expectedRevision}):** txn: read row (live); missing → `null`; `expectedRevision` given and ≠ row → throw `RoutineChangedError`; apply patch; if `schedule` changed or `enabled` changed: `next = enabled ? nextRunAtForSchedule(now) : null` (resume never catches up); else keep `next_run_at`; `revision = revision + 1`, `updated_at = now`. `creator_id` is never in the SET list.
- **delete({id}, {expectedRevision}):** txn: same revision check; `UPDATE … SET deleted_at=now, enabled=0, next_run_at=NULL, revision=revision+1`. Runs keep their FK target (soft delete), so links survive. Active run is not killed (OWNER-Q3).
- **claimDueSlot({fence, routineId, expectedNextRunAt, expectedRevision, nextRunAt, run}):** txn:
  0. `SELECT FENCE_OK` false → rollback → `'fence-lost'`.
  1. `row = SELECT enabled, next_run_at, revision, deleted_at`. Missing/deleted → `'gone'`; `enabled=0` → `'disabled'`; `next_run_at != expected` → `'slot-moved'`; **`revision != expectedRevision` → `'changed'` (slot not consumed)**.
  2. `UPDATE jini_routines SET next_run_at=:next WHERE scope=? AND id=? AND next_run_at=:expected AND revision=:rev AND enabled=1 AND deleted_at IS NULL` (changes must be 1, else `'slot-moved'`).
  3. If `EXISTS (… status IN ('queued','running'))` → commit the advance only; return `'active-run'` (slot consumed, I5).
  4. `INSERT` run (status `running`, `phase 'claimed'`, `slot_at = expected`, `holder_id`, `holder_generation = :gen`, `routine_revision`, `principal_id`, both message ids). `SQLITE_CONSTRAINT_UNIQUE` on `ux_…_slot` → rollback whole txn → `'slot-moved'`.
  5. `pruneHistory(routineId)` (unchanged; never prunes rows with `interrupt_pending = 1`).
  6. Commit → `{claimed:true}`.
- **insertManualRun({fence, routineId, expectedRevision, run}):** txn: `FENCE_OK` else `'fence-lost'`; live row else `'gone'`; `revision != expectedRevision` → `'changed'`; `INSERT` — `SQLITE_CONSTRAINT_UNIQUE` on `ux_…_active` → rollback → `'active-run'`; prune; commit `{ok:true}`. The service never calls `prepare` unless `ok` (I41).
- **admitPhase({fence, runId, phase}):** `UPDATE jini_routine_runs SET phase=:phase WHERE scope=? AND id=? AND status='running' AND holder_generation=:gen AND phase = :predecessor AND FENCE_OK` (predecessor: preparing←claimed, starting←preparing, started←starting) → `changes === 1` else `fence-lost` (or `not-running` when a plain re-read shows a terminal status).
- **settleRun({fence, runId, patch}):** single `UPDATE` with the column allow-list (status, completed_at, summary, error, error_code, ids, agent/model used) `WHERE … AND status IN ('queued','running') AND holder_generation=:gen AND FENCE_OK` → terminal statuses are sticky and a fenced-out writer cannot overwrite (I14, I40).
- **setApproval({runId, transition, ref, seq})** (T3): `UPDATE … SET approval_state=:to, approval_ref=:ref, approval_since=:now, approval_seq=:seq WHERE id=? AND status='running' AND approval_seq < :seq AND <transition guard>` — guard per transition: `open` → any state; `answer`/`expire` → `approval_ref = :ref AND approval_state = 'waiting'`. Observer-side, not lease-fenced (it only records facts the chat store already made durable); ordering is by the chat event `seq`.
- **listInFlight / markInterrupted:** `SELECT … WHERE scope=? AND status IN ('queued','running') AND holder_generation < :gen` (with `FENCE_OK`); mark: `UPDATE … SET status='interrupted', completed_at=:now, error_code='ROUTINE_INTERRUPTED', interrupt_pending = CASE WHEN phase IN ('starting','started') THEN 1 ELSE 0 END, approval_state=CASE approval_state WHEN 'waiting' THEN 'expired' ELSE approval_state END WHERE id IN (…) AND status IN ('queued','running') AND holder_generation < :gen AND FENCE_OK`. Own-run variant for T1 close: `markOwnInterrupted({fence, runIds})` with `holder_generation = :gen`.
- **listInterruptPending / clearInterruptPending:** `WHERE scope=? AND interrupt_pending=1`; clear = `UPDATE … SET interrupt_pending=0 WHERE id=? AND interrupt_pending=1 AND FENCE_OK`.
- **readLease:** `SELECT * FROM jini_routine_leases WHERE scope=?`.
- **acquireLease({holderId, now, ttlMs, proof, provenDead}):** txn: `row = readLease()`.
  - absent → `INSERT … generation=1` → ok.
  - `row.holder_id = holderId AND row.holder_boot_id = proof.bootId` → renew `expires_at` (same generation) → ok (same process re-acquiring after its own `releaseLease`/restart within one boot is impossible, so this is only the idempotent re-call).
  - `row.expires_at <= now` **or** (`provenDead` and `row.holder_id = provenDead.holderId AND row.generation = provenDead.generation`) → `UPDATE … SET holder_id=:me, generation=row.generation+1, expires_at=now+ttl, holder_pid…=proof` → ok with the new generation.
  - else → `{ ok:false, reason:'held', holder: row }`.
- **renewLease({fence, now, ttlMs}):** `UPDATE jini_routine_leases SET expires_at=:exp WHERE scope=? AND holder_id=:holder AND generation=:gen` → `changes === 1` else `fence-lost`.
- **releaseLease({fence}):** `UPDATE … SET expires_at = 0 WHERE scope=? AND holder_id=:holder AND generation=:gen` (keeps the row so the generation stays monotonic; the next acquirer sees it expired and writes `generation + 1`).
- **listRuns:** keyset page `(started_at, id) < (cursor)` using the history index; cursor = base64url JSON `{s, i}`; malformed → `ToolInputError` (existing contract at `routine-store.ts:70`).

**HTTP (`J/daemon/src/http/routines.ts`):** create/update parse optional `model` (string ≤ 200 or null) and `agentId`; `validateSchedule` for every path (already at `:142`). `RoutineHttpDeps` += `resolveCreator: (ctx: RouteInputContext) => string | null` (required for create; `null` → 401-class refusal), `availability?: () => { ok: true } | { ok: false; reason: 'ROUTINES_UNAVAILABLE' }`. Body fields `creatorId`/`ownerId` are never parsed. Delete/update accept `expectedRevision` (query `?revision=` for DELETE, body for PATCH). Error mapping — keep the `ApiError.code` family and add a stable `reason`:

| condition | status | code | reason | message (plain) |
|---|---|---|---|---|
| unknown/deleted id | 404 | `NOT_FOUND` | `ROUTINE_NOT_FOUND` | "This routine no longer exists." |
| bad schedule/timezone | 400 | `VALIDATION_ERROR` | `INVALID_SCHEDULE` | "Choose a valid schedule." |
| availability false | 503 | `UNAVAILABLE` | `ROUTINES_UNAVAILABLE` | "Routines run only while the desktop app is open." |
| revision mismatch | 409 | `CONFLICT` | `ROUTINE_CHANGED` | "This routine changed since you looked. Reload and try again." |
| run-now while active | 409 | `CONFLICT` | `ROUTINE_RUN_ACTIVE` | "This routine is already running." |
| > 200 routines | 400 | `VALIDATION_ERROR` | `ROUTINES_LIMIT` | "You have reached the routine limit (200)." |
`attachNextRunAt` now prefers the persisted `nextRunAt` when the scheduler has no armed timer (durable truth, D2).

### 3. State machine
Routine row: `live(enabled)` ⇄ `live(paused)` (update), → `deleted` (terminal, soft). Run row: see J1 §3; `approval_state`: `none → waiting → approved | declined | expired`; `waiting → waiting` (a second card replaces `ref`); `approved|declined → waiting` (a later card in the same run).

### 4. Concurrency + crash safety
- Every multi-statement op is one `IMMEDIATE` txn → a crash leaves either all or none (I11). Busy: rely on host `busy_timeout=5000`; `SQLITE_BUSY` after that bubbles as `ScheduledRunPersistenceError` (scheduler) or 503 `ROUTINES_BUSY` "Tovu is busy saving. Try again in a moment." (HTTP).
- Pause vs claim: both `IMMEDIATE` on the same DB → serialized; whichever commits second sees the other's state (I13).
- CRUD and scheduler share the prepared statements and the same `db`, so a CRUD write is visible to the next `persistence.list()` with no cache (no in-process cache exists → no staleness).
- Disk full: `SQLITE_FULL` → txn rolled back by SQLite; create/update return 507-class `ROUTINES_DISK_FULL` "Your disk is full, so the routine was not saved."

### 5. Failure modes and limits
Table above. Limits: ≤ 200 live routines per scope, ≤ 100 kept runs per routine (prune in the claim txn, O(100)), name ≤ 120, prompt ≤ 8000 chars, listRuns page ≤ 50.

### 6. Invariants → tests (`routines/__tests__/routine-store.sqlite.test.ts`, real in-memory better-sqlite3 **in the test only**)
- **I11** Claim and advance commit together. Test: `claim and advance roll back together` (inject a throwing prune). Mutation: commit claim and advance in separate txns.
- **I12** A second claim of the same slot loses. Test: `duplicate claim loses`.
- **I13 (R1123: two file-backed connections, Codex)** `Pause committed on connection B makes connection A's claim lose; claim committed first leaves the run alive and next_run_at NULL` — temp-file DB, two independent `better-sqlite3` handles (WAL, `busy_timeout`), each with its own store adapter; interleave with a barrier. Mutation: read `enabled` in a deferred (non-`IMMEDIATE`) txn and update without the `enabled=1` predicate → run inserted for a paused routine → red.
- **I43 (R1123)** `Every holder write refuses a stale generation` — table-driven over claim, manual insert, three `admitPhase` phases, `setNextRunAt`, `settleRun`, `clearInterruptPending`, `releaseLease`. Mutation: remove `FENCE_OK` from any one statement → that row red.
- **I44 (R1123)** `Takeover always increments generation` (expired and proven-dead paths). Mutation: keep the old generation on takeover → red.
- **I45 (R1123)** `markInterrupted sets the obligation only for starting/started runs and in the same statement` (crash injected after the UPDATE returns: reopen shows `interrupted` + `interrupt_pending = 1`). Mutation: set the obligation in a second statement → red under the injected crash.
- **I14** Terminal run statuses are sticky. Test: `late completion does not overwrite interrupted`.
- **I15** `reopen keeps routines and nextRunAt`; `scope isolation`; `pause clears nextRunAt, resume sets the next future slot`; `delete keeps run history links`; `CRUD write is visible to the scheduler adapter` (shared state, Codex J2).
- **I16** `creator_id` is immutable and never taken from the body. Tests: `update cannot change creator`, HTTP `POST ignores body ownerId and uses resolveCreator`. Mutation: parse `creatorId` from the body.
- **I17** HTTP accepts optional `model` and `agentId`. Test: `POST accepts optional model and agentId` (extend `http/__tests__/routines.test.ts`). Mutation: drop `agentId` in POST parsing.

### 7. Wiring
- `@jini-ai/daemon/routines/sqlite` (node) exports `createSqliteRoutineStore`, `SQLITE_ROUTINES_SCHEMA`. Types from `@jini-ai/core/contracts/storage` only. API baseline update (`api:update`), `pnpm guard` metadata. STOP if the guard refuses a node-only subpath without a `jini` metadata change.
- Must not import: `better-sqlite3` (borrowed handle only), `express`, `@tovu/*`, Node `fs`.

### 8. Open choices
- **OWNER-Q3:** Pausing or deleting a routine while it is running — stop the current run? **Recommend no**: pause/delete only stop future runs; the running conversation stays open and the owner can stop it there (stopping mid-run could leave half-applied work and needs its own approval card).

---

## P3-T1 · Tovu · per-site routine host + desktop lifecycle

(Codex T1: P8-T5 lands first. Under D1 the "idle hold" moves out of the daemon: the site server does not idle-park, and the daemon only has to stay up while a run is active, which P8-T5 owns.)

### 1. Data model
- DB file: `<dir of content.db>/ops/routines.db` (same sidecar pattern as `database-journal.ts:28–32`; separate connection; `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`). Owner: Tovu host composition. Excluded from site export/publish/backup copies (builder pins the exclude list next to the ops journal's; STOP if `ops/` is exported).
- Beacon file `<dir of content.db>/ops/routines-beacon.json` = `{ "v": 2, "enabled": <int>, "state": "settled" | "pending", "updatedAt": <ms> }`, written atomically (temp + fsync + rename + dir fsync via the existing durable JSON writer). Hint only (D5) — but **R1123 (Codex T1): a conservative hint is published before any DB commit that can raise the enabled count**, so no crash order leaves a stale zero (B4).
- In-memory: `RoutineHost` holds `{ service, store, persistence, state: 'off' | 'on' | 'closed' }`.
- Response type pinned for T4/T5 (`@tovu/contracts`, `routines.ts`): `RoutineRow = { id, name, prompt, schedule, enabled, agentId, model, revision, nextRunAt, lastRun: RoutineRunSummary | null }`, `RoutineRunSummary = { runId, status, catchUp, approvalState, startedAt, completedAt, conversationId, summary?, error?, errorCode? }`, list envelope `{ routines: RoutineRow[], availability: 'ready' | 'desktop-only' | 'assistant-off' | 'other-window' | 'error' }`.

### 2. Algorithm
**A. Composition gate (site server boot)** `W/server/runtime/composition/modules/assistant-routines.ts` `composeAssistantRoutines(required, optional)`:
1. **R1123 (Codex T1): eligibility comes from full launch admission, not from the env classification.** `classifyLocalOwnerLaunch` (`local-owner-signin.ts:48–55`) only checks the capability's *shape*; the parent-PID check is a separate step (`localLaunchEnvironmentRefusal`, `:57–62`). `resolveLocalOwnerSignIn` (`:16–24`) is extended to return `admission: { desktopOwner: boolean }` where `desktopOwner = desktop && launchRefusal === undefined` (shape valid **and** `TOVU_DESKTOP_OWNER_PID === String(parentPid)`), computed **before** the env scrub at `:111` and passed into composition as `launch.desktopOwner`. Composition never re-reads env and never recomputes from `desktopLaunch`/`desktop`.
2. Always mount the Jini routine specs at `/api/admin/assistant/routines…` behind the existing admin assistant guards, with `availability()` returning `desktop-only` when `!eligible` (I21) and `assistant-off` when the assistant is disabled.
3. If `!eligible` → return `{ host: null }`. No DB file is created.
4. Else `openRoutineDb()` → `createSqliteRoutineStore({db, scope: workspaceId}, {holderId: bootId})` → `new RoutineService({persistence}, {timers, now, newId, log, holderId: bootId, onInterrupted})` → `service.setRunHandler({handler: createRoutineRunHandler(...)})` (T2).
5. Register `onStoreClose` → `host.close()` (B3).
6. If assistant enabled → `host.enable()`.

**B. Lifecycle**
1. `enable({ reason })`: `state = 'on'`; `service.start({ reason })` — **R1123 (Codex T1): boot passes `reason: 'start'` (catch-up allowed); the assistant toggle passes `reason: 'enable'` (every overdue slot skipped, even inside grace, J1-C)**; then `await service.whenActiveOrPassive()` (first `tryAcquire` settled, first obligation drain awaited) before chat recovery is allowed to start (T2); `writeBeacon(settled)`.
2. `disable()` (assistant turned off): `state = 'off'`; `service.stop({})` (timers cleared, lease released). Active runs keep going (they are ordinary chat runs). `writeBeacon({enabled: 0, state: 'settled'})` — so desktop won't boot this site for routines while the assistant is off.
3. `close()` (site stop/quit): `service.stop({})` **first** (keeps the fence value for step 3b); then for each `active` run wait ≤ 2 s for its completion write; any still open → `markOwnInterrupted({fence, runIds})` (sets `interrupt_pending` for `starting|started`), then `await drainInterruptObligations()` with a 3 s cap — **this cancels the chat attempt in the daemon, which closes any leased card through the abort listener (`human-confirm.ts:126–127`)**, so a daemon that outlives the site server cannot keep a routine card open with nobody to record it (T3, Codex "daemon surviving site-server shutdown"); obligations not drained stay pending for the next boot; then the DB closes via `onStoreClose` (timers before DB, I19).
4. **Beacon write order (R1123, Codex T1).** `RoutineCommands` classifies each command: *raising* (create enabled, set-enabled true, assistant on) or *non-raising*.
   - Raising: (a) `writeBeacon({ enabled: max(current, 1), state: 'pending' })` durably; (b) DB commit; (c) `writeBeacon({ enabled: countLiveEnabled(), state: 'settled' })`. Crash after (a) → desktop boots the site (pending), whose host repairs the beacon from the DB at `enable()`. Crash after (b) → same. A failed (a) refuses the command ("Tovu couldn't save routine settings to disk. Nothing was changed.") — the DB is untouched.
   - Non-raising: DB commit, then settled write; a crash leaves a stale-high beacon → one unnecessary background boot, repaired at that boot.
   - A background-started site (D) whose repaired count is 0 and which the owner never opened stops itself again (`stopSiteBackend`, reason `routines-none`).

**C. `RoutineCommands`** (one in-process port used by HTTP specs and tools; Tovu-owned, `W/features/routines/routine-commands.ts`): `list`, `create`, `update`, `setEnabled`, `delete`, `runNow` — each = Jini store call → `service.rescheduleOne` → `onCommandCommitted`. Creator = principal id from the route context / tool ctx only.

**D. Desktop boot start (owner Q1)** in `D/main/boot/site-backend.ts` (new `startRoutineSites` beside `:148`), called from `D/main/index.ts` after app ready (after `ex4-desktop-tovu`):
1. `sites = listRegisteredLocalSites()` (Sites Home registry; builder pins the reader — UNVERIFIED name).
2. For each, skip if `withdrawnThisSession.has(siteDir)` or already running.
3. `beacon = readBeacon(siteDir)` (≤ 4 KB). **R1123: boot candidates are sites whose hint is positive *or uncertain*:** `enabled > 0`, `state === 'pending'`, `v === 1` (old format, no state), unreadable/corrupt beacon, or no beacon but an existing `ops/routines.db` (crash before the first beacon ever). Only "readable, `settled`, `enabled === 0`" and "no beacon and no `routines.db`" are skipped. Unreadable → `log.warn('ROUTINE_BEACON_UNREADABLE')` **and** boot.
4. Candidates → enqueue `startSiteBackend({siteDir, ctx}, {})` with concurrency 2, no window, failures logged (not dialogs).
5. Owner stops a site → `withdrawnThisSession.add(siteDir)`.

**E. Wake relay** (`D/main/index.ts`): `powerMonitor.on('resume', …)` → for each running desktop-owned site server with the private parent IPC channel, send `{type: 'routines.reconcile', reason: 'wake'}`; the site server maps it to `service.reconcile({reason:'wake'})`. Debounce 2 s. If a site server has no IPC channel, skip: J1-E's late-timer classification and the 5-minute arm cap already catch up within ≤ 5 min (so the relay is an accelerator, not a correctness dependency).

Split points: `composeAssistantRoutines`, `openRoutineDb`, `createRoutineHost` (enable/disable/close), `writeBeacon`, `createRoutineCommands`, `startRoutineSites`, `readBeacon`, `relayWake`.

### 3. State machine — routine host
`absent` (not eligible) — terminal for the boot. `off` —assistant on→ `on` —assistant off→ `off`; `on|off` —site stop/quit→ `closed` (terminal).

### 4. Concurrency + crash safety
- Two windows: both talk to the same site server → one host. Two site servers for one site dir (Web `npm run dev` attach race, two profiles): the Web-launched one is not eligible (no desktop capability); two desktop profiles → J2 lease, one passive (I18).
- Crash between DB commit and beacon write → covered (B4). Crash mid-boot-start → nothing persisted by main.
- Assistant disable during a fire: `stop` bumps generations; a claim already committed continues as a normal run.

### 5. Failure modes and limits
| failure | plain words | where | id |
|---|---|---|---|
| routines DB cannot open (corrupt/permission) | "Routines are unavailable because their data file could not be opened." | list `availability: 'error'`, admin banner; HTTP 503 | `ROUTINES_STORE_OPEN_FAILED` → admin `ERR-` id via `W/server/inbound/shared/admin-failure.ts:70,123` (`adminFailureResponse`, `sendAdminFailure`) |
| not desktop | "Routines run only while the desktop app is open." | HTTP 503, admin screen | `ROUTINES_UNAVAILABLE` |
| assistant off | "Turn on the AI assistant to run routines." | admin screen | `ROUTINES_ASSISTANT_OFF` |
| other window holds lease | "Routines for this site are running in another Tovu window." | admin screen | `ROUTINES_LEASE_HELD` |
| background site start fails | — (log only; Sites Home shows the site as stopped) | desktop log | `ROUTINE_SITE_START_FAILED` |
Limits: boot start concurrency 2; beacon ≤ 4 KB; wake debounce 2 s.

### 6. Invariants → tests (`W/server/runtime/composition/modules/__tests__/assistant-routines.integration.test.ts`, `D/main/boot/__tests__/site-backend.routines.test.ts`, `D/desktop-agent-service.test.ts`)
- **I18** Only a desktop-launched, capability-verified site server arms timers. Tests: `web-only / standalone has no routines and the API says "Routines run only while the desktop app is open."`, `request-supplied owner is ignored`. Mutation: gate on `desktopLaunch` alone (env presence) → red with a forged env.
- **I19** Timers stop before the DB closes; assistant off → no timers. Tests: `assistant off → no timers`, `site withdrawal stops timers`, `close marks open runs interrupted after the drain`.
- **I20** A routine fires with no admin tab open, past the daemon idle interval. Test: `a routine fires with no admin tab open past the idle interval` (fake clock; daemon demand fake counts one `ensureReady`). Mutation: start the service only when an admin session connects.
- **I21** Boot starts exactly the registered sites whose beacon says `enabled > 0`, never a withdrawn one; wake relays one reconcile per running site. Tests: `boot starts sites with enabled routines only`, `withdrawn site stays stopped this session`, `resume relays one reconcile`. Mutation: ignore `withdrawnThisSession`.
- **I46 (R1123)** `First enabled routine survives exit between DB commit and beacon update`: fake fs + crash injected after the DB commit of the first enabled create (step 4b) → the desktop boot reader sees `state: 'pending'` → starts the site → the routine fires; after `enable()` the beacon is `settled, enabled: 1`. Mutation: write the beacon only after the commit (old B4) → beacon absent/0 → site not started → red. Companion: `corrupt beacon boots the site and repairs it`, `settled zero with no routines does not boot`.
- **I47 (R1123)** `forged desktop env with a wrong parent pid has no routines` (valid 64-hex capability, `TOVU_DESKTOP_OWNER_PID` ≠ parent pid). Mutation: `eligible = launch.desktopLaunch && launch.desktop` (old A1) → routines armed → red.
- **I48 (R1123)** `Resume inside grace does not fire a missed slot` at the host level: assistant toggled on 10 s after a slot → `service.start` received `reason: 'enable'` → 0 runs. Mutation: host passes `'start'` on toggle → 1 run → red.

### 7. Wiring (to be copied into `W/features/routines/README.md` → Wiring, linking ADR-071)
- Required ports into `composeAssistantRoutines`: `{ launch: { eligible: boolean }, workspaceId, contentDbPath, openSqlite: SqliteSyncOpener, onStoreClose, assistantEnabled: () => boolean, onAssistantToggle, runStarter: RoutineRunStarter (T2), approvalObserver (T3), admin route mounter (Tovu's `jini-routes.ts` adapter), clock, newId, log }`.
- Provides: `RoutineCommands` (to T4 tools), Jini route specs mounted by the host, `reconcile` IPC handler.
- Desktop: `startRoutineSites({ listSites, readBeacon, startSiteBackend, isWithdrawn, log })`, `relayWake({ powerMonitor, sites })` — `powerMonitor` injected from `D/main/index.ts` only.
- Must not import: `electron` outside `D/main/index.ts`; `better-sqlite3` outside the DB opener; any daemon-process module (`W/server/inbound/assistant/*`) from the site-server routine host.

### 8. Open choices
- **OWNER-Q4 (= plan Q1):** Which sites start when Tovu opens? **Recommend** previously registered local sites whose beacon shows enabled routines, started in the background (no window); a site the owner stopped stays stopped this session. Why: "missed run = run once on reopen" only works if the site's server is running; starting every site costs memory.

---

## P3-T2 · Tovu · start a real owner chat run and record its result

### 1. Data model
- No new Tovu tables. Ids minted **in the handler** (pure, J1-G4): `conversationId = 'routine-' + runId`, `userMessageId`, `assistantMessageId` from `newId()`; returned in `RoutineRunHandlerStart` and **written by the claim row together with `principal_id`** (J2), so durable message identity and principal exist before any launch (I23). **R1123 (Codex T2): caller-supplied conversation ids are supported** — Jini `chat/src/store/sql/store.ts:450–476` inserts `input.id` and maps a unique violation to `ChatStoreError({ code: 'conflict' })`. The old orphan-conversation fallback is deleted. `prepare` is idempotent by id: `create` → `conflict` → `get({ id })`, accept it only when its owner is `principal_id` and its title carries this run's id, else fail `ROUTINE_CONVERSATION_CONFLICT`. Message appends use the same caller ids (builder confirms the append API takes ids; STOP if it does not).
- `contextRef` payload (host envelope, sanitized by the host `sanitizeContextRef` at `W/assistant/durable-runs/accept.ts:5`): `{ conversationId, assistantMessageId, principalId, routine: { routineId, runId, catchUp, slotAt }, model }`. **R1123: `model` rides in the same envelope field the daemon already decodes — `parseRunStartContextRef` → `model = decoded.model` (`agent-daemon-run-start.ts:222`); the sanitizer's allow-list keeps `model` and `routine`.**
- In-memory: `settlements: Map<runId, { resolve, reject, stopWatch }>`.

### 2. Algorithm
**handler({routine, trigger, startedAt, runId, catchUp, slotAt})** — pure: mint ids; resolve nothing external. Returns `{ projectId: '', conversationId, agentRunId: '', completion, prepare, start, discard, discardUnstarted }` where `completion` is a deferred.

**prepare(run)** (after the claim):
1. `principal = owners.require(routine.creatorId)`; refused (creator no longer an owner) → throw `RoutineOwnerGoneError` → J1 records `failed` "The person who created this routine can no longer use the assistant."
2. `choice = agents.resolve({ agentId: routine.agentId, model: routine.model })` → `{ agentId, model }` or refusal: `AGENT_UNAVAILABLE` "The agent this routine uses isn't installed or signed in. Open AI Assistant settings to fix it." / `MODEL_UNAVAILABLE` "This routine's model isn't available for that agent." **No substitute agent or model** (I25). BYOK agents refused in v1 (OWNER-Q5). Codex refused while OWNER-Q6 stands.
3. `store = chatHistory({kind:'user', workspaceId, userId: principal.id})`; create conversation `conversationId` titled `"<routine name> · <local date time>"`; append user turn `userMessageId` whose text is the routine prompt, prefixed for catch-up with: "Catch-up run: this was scheduled for <slot local time> but Tovu was closed or the computer was asleep." (owner rule "say so"); append the assistant stub `assistantMessageId` (whatever `proxyAcceptedRun` expects to exist).
4. Record `agent_id_used`, `model_used` via `updateRun`.

**start()** (sync per J1 contract; kicks async work) — runs only after J1-G9 `admitPhase('starting')` succeeded:
1. `acceptOwnerChatRun({ principalId: run.principalId, workspaceId, conversationId, messageId: run.assistantMessageId, agentId, model, contextRef })` — the **extracted, Express-free** acceptance binding (`W/server/runtime/composition/modules/assistant-run-acceptance.ts`, moved out of `proxyAcceptedRun`; the HTTP path becomes `parse → acceptOwnerChatRun → res.status(201)`). Same `createRunAcceptance` + `createHttpRunDaemonClient({ensureReady})` + finalizer `attach`.
2. Accepted → `admitPhase({ fence, runId, phase: 'started' })` with `agent_run_id` (fenced; a refusal means a new holder owns the run and will cancel it — log `ROUTINE_START_FENCED`, stop the watch). Accept returned a terminal run (tombstoned, §4) → settle nothing, stop.
3. `null` result (not found) → settle `failed` "The routine's conversation could not be started."
4. Start `watchSettlement({ messageId })` → resolves the deferred with `{status, summary, error, errorCode}` mapped from the durable message's final `runStatus` (`completed→succeeded`, `failed→failed`, `canceled→canceled`); summary = last assistant text, whitespace-collapsed, ≤ 280 chars. Watch = finalizer settlement callback if it exposes one, else durable `poll` with backoff 1 s → 5 s (cap), stopped on settle or host close.

**discard / discardUnstarted:** `discardUnstarted` (before `starting`): resolve the deferred as `canceled`; nothing external happened. `discard` (fenced out after `starting`, J1-G9): `cancelChatRunByMessage(run)` (below) so a later accept cannot launch; resolve `canceled`.

**onInterrupted({ run }) → 'canceled' | 'retry'** — R1123 (Codex T2): the J1-B′ obligation handler, **keyed by durable message identity, never by `agentRunId`** (which may never have been written):
1. `existing = durableRuns.findByMessage({ principalId: run.principalId, conversationId: run.conversationId, messageId: run.assistantMessageId })`.
2. Non-terminal → `durableRuns.cancel({ runId: existing.id, reason: 'routine-interrupted' })`; terminal → nothing to do.
3. None → `durableRuns.tombstone({ …messageIdentity, reason: 'routine-interrupted' })` — a terminal `canceled` record for that message so a resumed former holder's `accept` returns it without launching (Jini requirement below).
4. Every step succeeded and is durable → `'canceled'`; any throw/timeout (daemon down, store busy) → `'retry'`. The row keeps `interrupt_pending = 1` until `'canceled'`.
Chat recovery ordering: `routineHost.enable()` awaits the first drain before chat `recoverInterrupted` starts, **and** chat recovery receives `isRoutineInterruptPending(messageId)` (host hook backed by `listInterruptPending`) and skips any message still pending — so an obligation that returned `'retry'` across a second crash is still never resumed (STOP if recovery cannot take the skip predicate).

Split points: `createRoutineRunHandler` (≤ 40 lines, returns closures), `mintRoutineIds`, `prepareRoutineConversation`, `resolveRoutineAgent`, `acceptOwnerChatRun`, `watchSettlement`, `mapSettlement`, `cancelInterruptedChatRuns`.

### 3. State machine
Same as J1 run lifecycle; the chat message's `runStatus` drives the transition out of `running`.

### 4. Concurrency + crash safety
- Acceptance is idempotent per `(conversationId, messageId)` (`accept.ts:20`), so a retried `start` can't launch twice. **R1123 Jini requirement (part of J2's changeset):** `createRunAcceptance.accept` must return an existing **terminal** run for the message without calling `launch`, and the durable run store must expose `findByMessage` and `tombstone`. Jini test `accept never launches a message whose run is already terminal` (`J/chat/src/server/durable-runs/__tests__/accept.test.ts`). Mutation: relaunch when the existing run is terminal → red.
- Crash windows: see J1 §4; with pre-minted ids and persisted principal every row links its conversation and can be canceled by message identity.
- One principal throughout: `principalId` = `run.principal_id` (copied from `routine.creatorId` at claim) for store, acceptance, contextRef, finalizer, cancel (I22).

### 5. Failure modes and limits
Plain messages above; daemon not ready within the 30 s demand deadline → `failed` "The assistant service didn't start in time. The routine will run again at its next time." (`ROUTINE_DAEMON_UNAVAILABLE`). Watch poll ≤ 1 request / 5 s per active run.

### 6. Invariants → tests (`W/features/routines/__tests__/routine-run-handler.unit.test.ts`; integration through the real acceptance with two CLI adapter fakes: Claude, Codex — and agy in the Electron check)
- **I22** One principal throughout. Test: `one principal throughout`.
- **I23** The run row links the real conversation id from the claim onward. Test: `the result links the real conversation id`.
- **I24** An interrupted routine run is never resumed by chat recovery. Test: `interrupted after quit is recorded, not re-run`. Mutation: skip `cancelInterruptedChatRuns`.
- **I25** Unavailable agent/model fails with a plain reason and no substitute. Test: `unavailable agent or model fails with a plain reason and no substitute`.
- **I26** Routine runs go through owner-chat acceptance, not the executor. Test: `routine run uses acceptOwnerChatRun` (spy on the daemon client's `launch` via acceptance). Mutation: call the executor directly. Plus `claim loser starts nothing`.
- **I49 (R1123)** `Crash after accept and again after marking Interrupted never redispatches`: boot A claims, accepts (launch spy = 1), crashes; boot B takes over, `markInterrupted` sets `interrupt_pending`, crashes **before** the cancel completes; boot C drains (cancel by message) and then runs chat recovery → launch spy still 1, recovery skipped the message, obligation cleared. Mutations: (a) clear the obligation inside `markInterrupted` (old design: Interrupted before an in-memory callback) → boot C recovery redispatches → red; (b) chat recovery ignores `isRoutineInterruptPending` with the cancel forced to `'retry'` → red.
- **I50 (R1123)** `Interrupted run with no agentRunId is canceled by message identity` (crash between accept and `admitPhase('started')`). Mutation: look up by `agent_run_id` → nothing canceled → red.
- **I51 (R1123)** `routine model reaches run start through the sanitized context` (assert `decoded.model` at the daemon run-start parser). Mutation: drop `model` from the sanitizer allow-list → red.
- **I52 (R1123)** `prepare is idempotent on a caller-supplied conversation id` (second `prepare` after a crash reuses the conversation; a foreign-owned id fails `ROUTINE_CONVERSATION_CONFLICT`).

### 7. Wiring
Ports (Tovu, `@tovu/contracts/routines`): `RoutineRunStarter = { acceptOwnerChatRun, watchSettlement, cancelChatRun }`, `RoutineOwners = { require(id) }`, `RoutineAgents = { resolve({agentId, model}) }`, `chatHistory` factory. Must not import: Express types in `assistant-run-acceptance.ts`; daemon-process modules.

### 8. Open choices
- **OWNER-Q5 (= plan Q3):** BYOK routines in v1? **Recommend no** (local CLI agents only; BYOK needs its own unattended-cost checks).
- **OWNER-Q6:** Allow Codex as a routine agent before the 400 s outer tool deadline (`home-config.ts:48`) is fixed in Jini? **Recommend refuse Codex for routines** with "Codex can't run routines yet. Choose another agent." until P8-T9/A303's lease fix lands — an approval answered after 400 s could run an action the model was told failed.

---

## P3-T3 · Tovu · waiting for approval

### 1. Data model
Uses J2 `approval_state / approval_ref / approval_since` on the run row. `approval_ref` = the surface exchange id (`SURFACE_EXCHANGE_ID_PARAM`).

### 2. Algorithm
`createRoutineApprovalObserver({ readRunEvents, persistence, now })`, fed by the same watch loop as T2 (one read per tick). **R1123 (Codex T3): the observer consumes only durable chat-run events, each with its monotonic per-run `seq`, and every transition is ordered and scope-bound.**
Pinned event sources (builder records the exact event `type` strings in the feature README before coding; STOP if any of the three is not durable):
- **open:** the durable surface-emission event of the run-bound card, carrying `SURFACE_EXCHANGE_ID_PARAM = E` (`J/core/src/surface-exchanges.ts:19`) and the run's `principalId`.
- **answer:** the durable accepted-input receipt for exchange `E` (the record `askOnce` resolves from), classified with `classifyConfirmationAnswer` (only an explicit confirm is `approved`).
- **expiry:** the durable exchange-ended event (`expired`/`abandoned`, `J/core/src/surface-exchanges.ts:84`) for `E`.
1. For each event with `seq > cursor` in ascending `seq`: `t = classifyApprovalEvent(event)` (pure) → `open(E) | answered(E, confirmed) | ended(E) | ignore`. Events for other exchange ids, ordinary tool results, or a principal ≠ `run.principal_id` → `ignore` (I28).
2. Apply with `setApproval({ runId, transition: t, ref: E, seq: event.seq })` (J2): `open` replaces any older state; `answer`/`ended` apply only while `approval_state='waiting' AND approval_ref=E`; every transition requires `approval_seq < seq`. So a stale answer for card E1 cannot clear the newer card E2, and a replayed older event cannot roll state back.
3. Advance the cursor only after the write commits (a failed write is retried from the same `seq`).
4. Run settles while `waiting` → `settleRun` rewrites `waiting → expired`; quit/close → `markInterrupted` does the same — no consent inferred.
The effect itself runs inside `requireHumanConfirm` on the site server (D1 hop); the observer never calls a tool, never retries, never answers.

### 3. State machine
`none → waiting(E)`; `waiting(E) → approved | declined` (owner answer via the existing card), `→ expired` (exchange ended or run ended), `→ waiting(E2)` (a new card). Terminal per exchange.

### 4. Concurrency + crash safety
- The card is run-bound and leased (`J/daemon/src/surface-exchanges.ts:125–128`): no idle deadline, so it waits with zero tabs. Another owner cannot answer: lease requires `lifetime.principalId === binding.principalId` and delivery checks `principalId` (I29).
- **Daemon outlives the site server (R1123, Codex T3):** the shared daemon keeps running when one site stops. T1 `close()` cancels the chat attempt by message identity, which aborts the run; `requireHumanConfirm`'s abort listener (`human-confirm.ts:126–127`) closes the exchange; the observer is gone, so both durable records are reconciled by `markOwnInterrupted` (routine row `interrupted` + `expired`) and the chat run's own `canceled` status. An undrained cancel stays pending and is retried before chat recovery on the next boot (Codex OWNER-Q7 rec).
- Full quit → the daemon dies too; on next boot J1-B marks `interrupted` + `expired` and the obligation cancels the chat record before chat recovery (I30).
- **Leased deadline (R1123):** a supported CLI must not end a live leased approval at its own tool deadline. Claude/agy: proven by I53. Codex (`CODEX_TOOL_TIMEOUT_SEC = 400`, `home-config.ts:48`): refused as a routine agent until P8-T9/A303's fix lands and I53 passes for it (OWNER-Q6).

### 5. Failure modes and limits
Plain labels (T5): "Waiting for approval", "Approval declined", "Approval expired", "Interrupted". Observer read failures → retry next tick; never change state on a failed read.

### 6. Invariants → tests (`W/features/routines/__tests__/routine-approval.integration.test.ts`)
- **I27** With zero tabs the run waits and shows `waitingForApproval`; approving via the conversation runs the effect exactly once. Tests: `with zero tabs the run waits and shows waitingForApproval`, `opening the conversation and approving runs the effect exactly once`. Mutation: drop the run-bound lease (exchange expires at the idle TTL → red).
- **I28** An unrelated tool result does not clear waiting. Test: `an unrelated tool result does not clear waiting`. Mutation: clear waiting on any result.
- **I29** `decline leaves data unchanged`; `another owner cannot answer`.
- **I30** `quit → interrupted` (and `approval_state = expired`).
- **I28b (R1123)** `A stale answer cannot clear the next card`: events `open E1 (seq 1)`, `open E2 (seq 2)`, `answer E1 confirm (seq 3)` → state `waiting(E2)`. Mutation: drop `approval_ref = E` from the answer guard → `approved` → red. Companion: `replayed older open does not roll back` (seq guard).
- **I30b (R1123)** `site-server shutdown with a waiting card cancels the chat run and expires the card in both records` — daemon fake keeps running after the site host `close()`; assert chat run `canceled`, exchange closed, routine row `interrupted` + `expired`. Mutation: `close()` without the obligation drain → daemon card still open → red.
- **I53 (R1123)** `leased approval survives past the idle TTL and the agent's tool deadline` (Claude adapter fake with its real configured deadline; fake clock beyond both; answer → effect runs once). Mutation: give the routine card a normal idle deadline → expired → red.

### 7. Wiring
Port `RoutineApprovalObserver` (Tovu) consumes `readRunEvents({messageId, cursor})` (durable store `head`/`poll`). Reuses Core approval/surface contracts as moved by `ex5-fnd-inject`; host approval policy stays in Tovu; no executable code in Core's types-only `contracts` tree (Codex T3 / P9 K5-contracts-core-10). Share lease work with P8-T9/A303.

### 8. Open choices
- **OWNER-Q7 (= plan Q2):** Does a pending approval survive a full quit? **Recommend no** — mark **Interrupted**, approval **expired**; the next slot runs normally.

---

## P3-T4 · Tovu · assistant tools

### 1. Data model
Metadata `W/contracts/core/tool-metadata/routines.ts` (product copy stays in Tovu):
- `routine_list`: `approval: { class: 'read', confirmation: 'direct' }` (no card; read-only).
- `routine_create`, `routine_set_enabled`, `routine_delete`: `approval: { class: 'edit', confirmation: 'direct' }` — **`direct`, not `policy`**, so a cached policy approval can never skip the card (Codex T4). The tool body calls `requireHumanConfirm` itself.
Input schemas: create `{ name, prompt, schedule, agentId?, model? }`; set_enabled `{ id, enabled, revision }`; delete `{ id, revision }`; list `{}` → rows (T1 shape) incl. `revision`.

### 2. Algorithm (mutating tool)
1. Parse + `validateSchedule` (+ timezone required for daily/weekdays/weekly; the description tells the model to ask). Invalid → `ToolInputError` "Choose a valid schedule." (nothing shown, nothing saved). **R1123:** the parsed input is frozen into `action = { tool, routineId?, revision?, payload }` and `actionHash = sha256(canonicalJson(action))`; the card renders from `action` only.
2. For set_enabled/delete: `current = commands.get(id)`; missing → "This routine no longer exists."; `current.revision !== input.revision` → "This routine changed since you looked. List routines again." (I33).
3. `outcome = await requireHumanConfirm({ ctx, surfaces, spec }, { emitSurface })` — **R1123 (Codex T4–T5): `emitSurface` is the second argument (`human-confirm.ts:108–111`), taken from the tool's `ToolExecutionOptions` as it arrives over the D1 site-tool hop.** Card fields Schedule, Prompt, Agent ("Agent default" when none), Model, and the note "This routine runs only while Tovu is open and your computer is awake". `!confirmed` → return "Nothing was changed." (I31, I32). `requireHumanConfirm` already re-checks the access approver and grant after the answer (`:131–133`).
4. **Bind to the confirmed action (R1123):** after confirm, recompute `actionHash` from the frozen `action` and compare with the hash embedded in the card spec (defends against a mutated closure); then `owners.require(ctx.principal.id)` and the admin-assistant permission are re-checked; then the command runs with `expectedRevision = action.revision` inside the J2 txn. A change during the card wait → refuse as in step 2. Create (no revision) binds `{payload}` and re-checks the 200-routine limit inside the txn.
5. Execute via `RoutineCommands` with `creatorId = ctx.principal.id` (site-side principal, proven equal to the daemon run principal by I54).
6. Return the row.
**Entry-point coverage (R1123):** AI tools in v1 = `routine_list`, `routine_create`, `routine_set_enabled` (pause **and resume**), `routine_delete`. **`routine_update` and `routine_run_now` are explicitly deferred** (not registered; the description says "To change or run a routine now, use the Routines screen"). The admin HTTP `PATCH` (edit/resume) and `POST …/run` are owner clicks in T5 with their own ConfirmDialog, covered by J2's HTTP tests (`PATCH with stale revision → 409 ROUTINE_CHANGED`, `run-now while active → 409 ROUTINE_RUN_ACTIVE`, `resume never catches up`).
Hourly description text: "A routine is a recurring AI job. It runs only while the Tovu desktop app is open and your computer is awake. Hourly routines run at a minute past the hour; ask for a timezone for daily or weekly times." (Plan text; the "minute past the hour" means the chosen minute.)

### 3. State machine — N/A (stateless per call).

### 4. Concurrency + crash safety
Card then CAS; crash after confirm before commit → nothing saved (owner re-asks); crash after commit → saved, card answered.

### 5. Failure modes
As above, plus headless (no `emitSurface`) → `…_NO_CONFIRMATION_CHANNEL` (existing) → "Nothing was changed."

### 6. Invariants → tests (`W/features/routines/__tests__/routine-tool-registrations.unit.test.ts`)
- **I31** `create opens the card before saving`. Mutation: write before the card.
- **I32** `decline saves nothing`; cached-approval context still opens the card (`policy cache cannot skip routine cards`); denied/absent owner context refuses.
- **I33** `stale row on delete is refused`.
- **I34** `visitors never see the tools`; approval metadata completeness test passes; catalog golden bytes + names re-recorded. Contribution hidden (not in the manifest) until T3 lands.
- **I54 (R1123)** `routine_create over the daemon→site hop opens the card for the run principal` (real `createRoutingToolExecutor` with `siteTools.remote` fake transport): card opens on the run's conversation, `ctx.principal.id` on the site side equals the run principal. Mutations: remote transport drops `emitSurface` → `…_NO_CONFIRMATION_CHANNEL` → red; remote side substitutes the site owner principal → red.
- **I55 (R1123)** per mutator (create, set_enabled true, set_enabled false, delete): `edit during the card wait refuses <tool>`, `cached approval still opens the card for <tool>`, `owner revoked after confirm saves nothing for <tool>`. Mutation: run the command with the input's revision re-read after the card instead of `action.revision` → edit-during-wait test red.
- **I56 (R1123)** `requireHumanConfirm receives emitSurface as its second argument` (spy). Mutation: pass `{ ctx, surfaces, spec, emitSurface }` in one object → headless refusal → red.

### 7. Wiring
`contributeRoutineTools({ commands, surfaces })` in `W/features/routines/routine-tool-registrations.ts`, registered at `tool-registrations.ts:495` / manifest; metadata registered in `nativeToolMetadata` (`index.ts:70`). Rebase on `ex5-fnd-inject` (approval type split) and `ex5-collections` (manifest). i18n keys from the plan in `approval-i18n.ts` (all locales).

---

## P3-T5 · Tovu · Routines admin screen

### 1. Data model
Client state only: `RoutinesViewState = { rows, availability, loading, error: { kind: 'transport' | 'server'; errorId? } | null, editing: RoutineRow | 'new' | null, confirming: { kind: 'delete' | 'pause' | 'resume' | 'run-now', row } | null }` — **R1123 (Codex T4–T5): resume has its own confirmation state** ("Resume this routine? Missed times are skipped; it next runs at <time>.").

### 2. Algorithm
1. `useRoutinesController` (injected prop) loads `GET /api/admin/assistant/routines`; refresh on window focus and every 30 s while the panel is visible (stop when hidden — bounded cost).
2. Render `DataTable` columns: name; schedule (hourly → "At :MM past every hour"; others show time + timezone); status (Paused / enabled); agent/model ("Agent default"); next run; last run (time, label from `lastRun`: `catchUp` → "Catch-up run", `approvalState='waiting'` → "Waiting for approval", `declined` → "Approval declined", `expired` → "Approval expired", `status='interrupted'` → "Interrupted"; **Open conversation** link).
3. `RowMenu` → Pause / **Resume** / Run now → `ConfirmDialog` per `confirming.kind` → PATCH `{enabled, revision}` / POST run; Delete → `ConfirmDialog` → DELETE `?revision=`; 409 `ROUTINE_CHANGED` → "This routine could not be deleted because it changed. Reload and try again." and reload; 409 `ROUTINE_RUN_ACTIVE` → "This routine is already running."
3b. **Response classification (R1123, Codex):** `routines-api.ts` returns a discriminated result: `ok` | `availability` (HTTP 503 with `reason ∈ ROUTINES_UNAVAILABLE | ROUTINES_ASSISTANT_OFF | ROUTINES_LEASE_HELD | ROUTINES_STORE_OPEN_FAILED` → set `availability`, keep the empty-state copy, **no error toast**) | `refused` (4xx with `reason`) | `server` (5xx without an availability reason → error with the admin `ERR-` id) | `transport` (fetch rejected/aborted → "Tovu couldn't reach the site. Retrying…", keep last rows, retry on next poll).
4. `RoutineForm` uses the injected `useSchedulePicker` (Jini `RecurringSchedulePicker`); save → POST/PATCH; 400 → "This routine could not be saved. Check the schedule and try again."
5. Availability ≠ ready → empty state "Open the Tovu desktop app to manage routines" (or the T1 message).
6. Deep link: `allowedQueryParams` of `ai-assistant` (`panels.tsx:187`) gains `conversation`. Host binding (new `useConversationDeepLink({ query, chats })`, injected): on mount and on query change, if `conversation` present → `chats.select({ id })` once; never `create`, never send. Missing/inaccessible id → toast "This conversation is no longer available." and clear the param (I37).
Panel registered beside AI Assistant in `ADMIN_PANELS`.

### 3–5.
No lifecycle beyond fetch. Failures map to the plain strings above; HTTP failures carry the admin `ERR-` id in the toast detail.

### 6. Invariants → tests (`A/features/routines/__tests__/Routines.test.tsx`, dock test)
- **I35** `shows Waiting for approval and Catch-up run labels`. Mutation: drop `waitingForApproval` (`approvalState`) from the row projection.
- **I36** `pause/resume and delete with cancel`, `hourly shows minute past the hour, daily shows its timezone`, `menu works by keyboard`.
- **I37** `conversation deep link selects it without starting a run`, `deep link after reload selects the authorized conversation`, `missing or inaccessible conversation shows a notice and launches nothing`. Mutation: link without selecting.
- **I57 (R1123)** `resume asks for confirmation and sends the current revision`; `503 ROUTINES_UNAVAILABLE shows the desktop-only empty state, not an error`; `network failure keeps the last rows and shows retry`. Mutation: treat every non-2xx as `error` → availability test red. Hooks stay REQUIRED props (`useRoutinesController`, `useSchedulePicker`, `useConversationDeepLink`); the authorized reload / deep-link tests from I37 are kept unchanged.

### 7. Wiring
Required hook props: `useRoutinesController`, `useSchedulePicker`, `useConversationDeepLink`, locale, theme, `t`; admin kit slots per P12 #6/#8. Must not import: `fetch` directly inside components (only via `routines-api.ts` passed into the controller), Jini daemon packages (UI imports `@jini-ai/ui` picker only).

---

## Execution notes for builders
- Order unchanged: J1 → J2 → (Jini artifact) → T1 → T2 ∥ T4 → T3 → T5; P8-T5 before T1. Feature hidden until T3 combined.
- Every new function ≤ 80 lines / complexity ≤ 10 at the named split points; no re-export shells (import `@jini-ai/daemon/routines/sqlite` directly).
- Electron check list from the plan stays; add: two desktop profiles on one site → one runs, the other shows "running in another Tovu window".

## R1123 · OWNER-Q (P3, consolidated; Codex `plans1123.md` recommendations adopted unless noted)
- **Q1** skipped-slot visibility → keep skipped slots out of run history; log the reason (`ROUTINE_SLOT_SKIPPED_ACTIVE`).
- **Q2** catch-up after deliberate re-enable → skip, even inside grace (I10, I48).
- **Q3** pause/delete while running → let the active run finish.
- **Q4** which sites start on open → eligible registered sites in the background, with crash-safe discovery (pending/uncertain beacon boots; I46).
- **Q5** BYOK routines → defer.
- **Q6** Codex as routine agent → refused until the leased-deadline fix lands and I53 passes for Codex.
- **Q7** approval across quit → expire unanswered approvals on full quit; reconcile the routine row and the chat run (obligation drain) before chat recovery.
- **Q8 (new)** run-status typing → **additive durable types, `@jini-ai/daemon` minor** (recommended) vs one widened `RoutineRunStatus` + major.
- **Q9 (new)** Jini acceptance tombstone (`findByMessage`, `tombstone`, no launch on terminal) → **approve** as part of J2's Jini release; without it the post-`starting` fence window cannot be closed and the routine feature must stay hidden.
