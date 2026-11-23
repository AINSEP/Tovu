DESIGN COMPLETE

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

**D1 — The scheduler lives in the desktop-launched site server process, not in the agent-daemon scope.** The plan said "bind in `createSiteScope`". Rejected because: (a) the daemon is shared across sites, demand-started and idle-parked (`agent-daemon-server.ts:191`); a scheduler there either pins it awake forever (defeats P8-T5) or dies on park; (b) a daemon scope exists only after a demand, so nothing would exist to fire the first slot; (c) everything a fire needs is already in the site server: the routine owner's principal, the chat history store (`assistant-chats.ts:100`), durable acceptance (`assistant.ts:175`), admin routes, and `ensureAssistantDaemonReady` (`daemon-supervisor.ts:745`), which restarts a parked daemon on demand. The site server lives until the owner stops the site or quits Tovu. This satisfies Codex T1's "one site-scoped command port across the admin-server/daemon boundary" trivially: there is no cross-process command port — HTTP routes, tools and timers all call the same in-process `RoutineCommands`. The daemon only needs to stay awake while a run is active, which is the existing chat-run requirement (P8-T5).

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
  - New opt-in port `RoutineDurablePersistence extends RoutinePersistence` (sync, because better-sqlite3 is sync — keeps the existing sync rationale at `types.ts:102–117`):
    ```ts
    claimDueSlot(a: { routineId; expectedNextRunAt: number; nextRunAt: number | null; run: RoutineRun }): { claimed: true } | { claimed: false; reason: 'slot-moved' | 'disabled' | 'gone' | 'active-run' };
    setNextRunAt(a: { routineId; expected: number | null; nextRunAt: number | null }): boolean;   // CAS, used when arming a routine with no stored slot
    listInFlight(a: { holderId?: string }): RoutineRun[];                                            // status in ('queued','running')
    markInterrupted(a: { runIds: readonly string[]; now: number }): number;
    acquireLease(a: { holderId: string; now: number; ttlMs: number }): boolean;                      // also renews
    releaseLease(a: { holderId: string }): void;
    ```
    Feature-detected with `isDurablePersistence(p)` (`typeof p.claimDueSlot === 'function'`). Legacy in-memory path keeps `insertRun(…, {scheduledSlotAt})` unchanged.
- `RoutineService` constructor optional seams (second object): `now`, `newId`, `timers: SchedulerPort` (default `createTimeoutScheduler({})`), `log: RoutineDiagnostics` (`{ warn(code, fields), error(code, fields) }`, default console), `holderId` (default `newId()`), `graceMs` (default `60_000`), `maxArmMs` (default `300_000`), `leaseTtlMs` (default `90_000`).
- In-memory state (per service): `armed: Map<routineId, { gen: number; slotAt: number; cancel: () => void }>`, `gen: Map<routineId, number>` (monotonic, never reset while the service lives), `active: Map<routineId, runId>` (claim → completion settled), `started: boolean`, `leaseTimerCancel`.

### 2. Algorithm
Constants: `GRACE = graceMs` (60 s), `MAX_ARM = maxArmMs` (5 min).

**A. `start({})`**
1. If `started` return. Set `started = true`.
2. Durable only: `acquireLease({holderId, now, ttlMs})`. If false → `log.warn('ROUTINES_LEASE_HELD')`, schedule a retry in `leaseTtlMs`, return (another live process owns this scope; this one stays passive).
3. Durable only: `reconcileInFlight()` (B) **before** any active-run test.
4. `reconcile({reason: 'start'})` (C).
5. Arm the lease heartbeat every `leaseTtlMs / 3` (`acquireLease` renew; on false → `stop({})` + `log.error('ROUTINES_LEASE_LOST')`).

**B. `reconcileInFlight()`** — previous process died mid-run.
1. `runs = listInFlight({})`.
2. Filter out runs whose `id` is in `active` (this process's own).
3. `markInterrupted({runIds, now})` in one transaction; emit `onInterrupted?.({runs})` (host hook, T2 uses it to cancel chat recovery — I24).
4. Never re-run them; `nextRunAt` is untouched (the next slot stays scheduled).

**C. `reconcile({reason})`**, `reason ∈ 'start' | 'wake' | 'enable' | 'edit'`:
1. For each `r` in `persistence.list()`: bump `gen[r.id]`, cancel `armed[r.id]`.
2. `decision = classifySlot({routine: r, now, grace, reason})` (pure):
   - `!r.enabled` → `idle`.
   - `r.nextRunAt == null` → `seed` (compute `next = nextRunAtForSchedule(now)`).
   - `r.nextRunAt > now` → `arm(r.nextRunAt)`.
   - `now - r.nextRunAt <= GRACE` → `fire({catchUp: false})`.
   - `reason === 'enable'` (OWNER-Q2 rec) → `skip` (advance without running).
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

**G. `start_` durable path** (existing order kept; claim swapped):
1. If `active.has(routineId)` → manual: throw `RoutineActiveError` (HTTP 409 `ROUTINE_RUN_ACTIVE`); scheduled: fall through (the claim will consume the slot with `active-run`, I5).
2. `routine = list().find(...)`; missing → `Routine not found`.
3. `handlerStart = await handler({routine, trigger, startedAt, runId, catchUp, slotAt})` — **must be effect-free** (STOP rule: if a host `handler` needs external work before the claim, stop).
4. Build `run` (`status: 'running'`, `catchUp`, `slotAt`, `holderId`).
5. Scheduled: `next = nextRunAtForSchedule({schedule}, {now: new Date(max(now(), slotAt + 1))})`; `res = claimDueSlot({routineId, expectedNextRunAt: slotAt, nextRunAt: next, run})`.
   - `claimed:false` → `discardUnstartedRun(attempt)`; if `reason === 'active-run'` → `log.warn('ROUTINE_SLOT_SKIPPED_ACTIVE')`. Return the handle (no conversation is created — I4).
   - Manual: `insertRun({run})` (the partial unique index still enforces one active run).
6. `active.set(routineId, runId)`.
7. `await prepare(run)` → `persistPreparedIds` (unchanged). On throw → `finalizeUnpreparedRun` (unchanged) + `active.delete`.
8. `wireRunCompletion` → on settle: `updateRun(terminal)` **then** `active.delete(routineId)`.
9. `startPreparedRun` (unchanged).

**H. `pause/edit/delete` hooks** — CRUD commits first (J2), then the caller invokes `rescheduleOne({routineId})` = bump gen, cancel armed, re-read row, `classifySlot` with `reason: 'edit'` (a resumed routine's stored slot is already future, J2 computes it).

**I. `stop({})`** → `started = false`; bump every gen; cancel all armed; cancel heartbeat; `releaseLease`. Active runs are **not** awaited here (host decides, T1-C).

**Split points (≤ 80 lines, complexity ≤ 10 each):** `classifySlot` (pure), `applySlotDecision`, `arm`, `onTimer`, `fireSlot`, `rearmFromStore`, `reconcile`, `reconcileInFlight`, `claimScheduledSlot` (G5), `startDurable_` vs existing legacy `start_` body (choose by `isDurablePersistence` once, in the constructor, store as a strategy object `{claim(attempt)}` so `start_` stays one function).

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
- **Two processes / two profiles on the same site DB:** lease row (`acquireLease`) makes only one process arm timers; a passive process retries every `leaseTtlMs`. B only marks runs not held by a live lease holder (`holder_id != me` and lease expired, enforced in SQL by J2).
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
- **I10** `enable` reconcile does not catch up (pending OWNER-Q2). Test: `re-enabling the assistant skips overdue slots without running`.

### 7. Wiring
- Ports: `RoutineDurablePersistence` (Jini, `routines/types.ts`), `SchedulerPort` (Jini `J/daemon/src/scheduler.ts`), `RoutineDiagnostics` (new, `routines/types.ts`), clock/newId functions. Host passes the J2 adapter's `persistence`, `holderId = <site server boot id>`, and `onInterrupted` (T2).
- Must not import: `node:timers` directly in `scheduler.ts` (use the port), any `@tovu/*`, `express`, `better-sqlite3`, `electron`.
- Changeset: `@jini-ai/daemon` minor (additive types + `interrupted` status). `RoutineRunStatus` widening is additive for producers but a **breaking** change for exhaustive consumers → note in the changeset.

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
  catch_up INTEGER NOT NULL DEFAULT 0, slot_at INTEGER, holder_id TEXT,
  project_id TEXT NOT NULL, conversation_id TEXT NOT NULL, agent_run_id TEXT NOT NULL,
  agent_id_used TEXT, model_used TEXT,
  started_at INTEGER NOT NULL, completed_at INTEGER,
  summary TEXT, error TEXT, error_code TEXT,
  approval_state TEXT NOT NULL DEFAULT 'none' CHECK (approval_state IN ('none','waiting','approved','declined','expired')),
  approval_ref TEXT, approval_since INTEGER,
  PRIMARY KEY (scope, id),
  FOREIGN KEY (scope, routine_id) REFERENCES jini_routines (scope, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_jini_routine_runs_slot   ON jini_routine_runs (scope, routine_id, slot_at) WHERE slot_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_jini_routine_runs_active ON jini_routine_runs (scope, routine_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_jini_routine_runs_history ON jini_routine_runs (scope, routine_id, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS jini_routine_leases (scope TEXT PRIMARY KEY, holder_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
```
Factory: `createSqliteRoutineStore({ db, scope }, { now, newId, holderId, schemaSetup = 'ensure', historyLimit = 100 })` → `{ store: RoutineStore; persistence: RoutineDurablePersistence }` — **two adapters over one set of prepared statements** (Codex J2: `RoutineStore` is async, `RoutinePersistence` sync). Exported `SQLITE_ROUTINES_SCHEMA` for host-managed migration (mirror `sqlite-policy.ts`).
`RoutineCreateInput` += `model?: string | null`, required `creatorId` is **not** part of the input — it is a second-object field supplied by the trusted caller: `store.create(required, { ...optional, creatorId })`. `RoutineUpdateInput` += `model?`, `expectedRevision?` (in the optional object of `update`/`delete`).

### 2. Algorithm (every write = one `db.transaction(fn).immediate()`)
- **ensureSchema:** if `schemaSetup === 'host'` → `SELECT 1 FROM jini_routine_schema WHERE name='jini-routines-v1'`, absent → throw "routine store schema missing". Else `exec(SQLITE_ROUTINES_SCHEMA)` + `INSERT OR IGNORE` the name.
- **create(required, optional):** `validateSchedule`, `validateTarget`, name/prompt bounds → txn: `next = enabled ? nextRunAtForSchedule(now) : null`; `INSERT … revision=1`. Return row + `lastRun: null`.
- **get / list:** `WHERE scope=? AND deleted_at IS NULL` (list ordered `created_at, id`, max 200 rows — owners have few routines; >200 → `ROUTINES_LIMIT` on create). `lastRun` = one indexed query per routine via `idx_jini_routine_runs_history LIMIT 1` (n ≤ 200).
- **update({id, patch}, {expectedRevision}):** txn: read row (live); missing → `null`; `expectedRevision` given and ≠ row → throw `RoutineChangedError`; apply patch; if `schedule` changed or `enabled` changed: `next = enabled ? nextRunAtForSchedule(now) : null` (resume never catches up); else keep `next_run_at`; `revision = revision + 1`, `updated_at = now`. `creator_id` is never in the SET list.
- **delete({id}, {expectedRevision}):** txn: same revision check; `UPDATE … SET deleted_at=now, enabled=0, next_run_at=NULL, revision=revision+1`. Runs keep their FK target (soft delete), so links survive. Active run is not killed (OWNER-Q3).
- **claimDueSlot({routineId, expectedNextRunAt, nextRunAt, run}):** txn:
  1. `row = SELECT enabled, next_run_at, deleted_at`. Missing/deleted → `{claimed:false, reason:'gone'}`; `enabled=0` → `'disabled'`; `next_run_at != expected` → `'slot-moved'`.
  2. `UPDATE jini_routines SET next_run_at=:next WHERE scope=? AND id=? AND next_run_at=:expected AND enabled=1 AND deleted_at IS NULL` (changes must be 1, else `'slot-moved'`).
  3. If `EXISTS (… status IN ('queued','running'))` → commit the advance only; return `'active-run'` (slot consumed, I5).
  4. `INSERT` run (status `running`, `slot_at = expected`, `holder_id`). A `SQLITE_CONSTRAINT_UNIQUE` on `ux_…_slot` → rollback whole txn → `'slot-moved'`.
  5. `pruneHistory(routineId)`: `DELETE FROM jini_routine_runs WHERE scope=? AND routine_id=? AND status NOT IN ('queued','running') AND id NOT IN (SELECT id … ORDER BY started_at DESC, id DESC LIMIT :historyLimit)`.
  6. Commit → `{claimed:true}`.
- **insertRun (manual):** txn: live+enabled-agnostic row check; `INSERT` (unique active index → return `false` → caller maps to `ROUTINE_RUN_ACTIVE`); prune.
- **updateRun({id, patch}):** single `UPDATE` with a column allow-list (status, completed_at, summary, error, error_code, ids, agent/model used, approval_*). Terminal statuses are sticky: `WHERE status IN ('queued','running')` for any status change (a late completion cannot overwrite `interrupted`, I14).
- **setApproval({runId, state, ref, expectedRef})** (used by T3 via `updateRun` semantics): `UPDATE … SET approval_state=?, approval_ref=?, approval_since=? WHERE id=? AND status='running' AND (approval_ref IS ? OR :expectedRef IS NULL)`.
- **listInFlight / markInterrupted:** `SELECT … WHERE scope=? AND status IN ('queued','running') AND (holder_id IS NULL OR holder_id != :me)`; mark: `UPDATE … SET status='interrupted', completed_at=:now, error_code='ROUTINE_INTERRUPTED', approval_state=CASE approval_state WHEN 'waiting' THEN 'expired' ELSE approval_state END WHERE … AND status IN ('queued','running')`.
- **acquireLease({holderId, now, ttlMs}):** `INSERT INTO jini_routine_leases VALUES (?,?,?) ON CONFLICT(scope) DO UPDATE SET holder_id=excluded.holder_id, expires_at=excluded.expires_at WHERE jini_routine_leases.holder_id = excluded.holder_id OR jini_routine_leases.expires_at <= :now` → `changes === 1`.
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
- **I13** Pause committed before a claim makes the claim lose; claim before pause leaves the run alive and `next_run_at = NULL`. Test: `concurrent pause versus claim`.
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
- Beacon file `<dir of content.db>/ops/routines-beacon.json` = `{ "v": 1, "enabled": <int>, "updatedAt": <ms> }`, written atomically (temp + fsync + rename via the existing `createDurableJsonFile`/atomic writer). Hint only (D5).
- In-memory: `RoutineHost` holds `{ service, store, persistence, state: 'off' | 'on' | 'closed' }`.
- Response type pinned for T4/T5 (`@tovu/contracts`, `routines.ts`): `RoutineRow = { id, name, prompt, schedule, enabled, agentId, model, revision, nextRunAt, lastRun: RoutineRunSummary | null }`, `RoutineRunSummary = { runId, status, catchUp, approvalState, startedAt, completedAt, conversationId, summary?, error?, errorCode? }`, list envelope `{ routines: RoutineRow[], availability: 'ready' | 'desktop-only' | 'assistant-off' | 'other-window' }`.

### 2. Algorithm
**A. Composition gate (site server boot)** `W/server/runtime/composition/modules/assistant-routines.ts` `composeAssistantRoutines(required, optional)`:
1. `eligible = launch.desktopLaunch && launch.desktop` (from `classifyLocalOwnerLaunch`, captured **before** the env scrub at `local-owner-signin.ts:111` and passed in as a boolean — never re-read env).
2. Always mount the Jini routine specs at `/api/admin/assistant/routines…` behind the existing admin assistant guards, with `availability()` returning `desktop-only` when `!eligible` (I21) and `assistant-off` when the assistant is disabled.
3. If `!eligible` → return `{ host: null }`. No DB file is created.
4. Else `openRoutineDb()` → `createSqliteRoutineStore({db, scope: workspaceId}, {holderId: bootId})` → `new RoutineService({persistence}, {timers, now, newId, log, holderId: bootId, onInterrupted})` → `service.setRunHandler({handler: createRoutineRunHandler(...)})` (T2).
5. Register `onStoreClose` → `host.close()` (B3).
6. If assistant enabled → `host.enable()`.

**B. Lifecycle**
1. `enable()`: `state = 'on'`; `service.start({})` (J1-A, which reconciles in-flight runs and catches up once); `writeBeacon()`.
2. `disable()` (assistant turned off): `state = 'off'`; `service.stop({})` (timers cleared, lease released). Active runs keep going (they are ordinary chat runs). `writeBeacon({enabled: 0})` — so desktop won't boot this site for routines while the assistant is off.
3. `close()` (site stop/quit): `service.stop({})` **first**; then for each `active` run wait ≤ 2 s for its completion write; any still open → `persistence.markInterrupted`; then the DB closes via `onStoreClose` (timers before DB, I19).
4. `onCommandCommitted()` (after every create/update/delete): `writeBeacon()` with `enabled = count(live enabled)`; DB commit happens first, beacon second (crash between → beacon stale until next boot of this site, which rewrites it; I20).

**C. `RoutineCommands`** (one in-process port used by HTTP specs and tools; Tovu-owned, `W/features/routines/routine-commands.ts`): `list`, `create`, `update`, `setEnabled`, `delete`, `runNow` — each = Jini store call → `service.rescheduleOne` → `onCommandCommitted`. Creator = principal id from the route context / tool ctx only.

**D. Desktop boot start (owner Q1)** in `D/main/boot/site-backend.ts` (new `startRoutineSites` beside `:148`), called from `D/main/index.ts` after app ready (after `ex4-desktop-tovu`):
1. `sites = listRegisteredLocalSites()` (Sites Home registry; builder pins the reader — UNVERIFIED name).
2. For each, skip if `withdrawnThisSession.has(siteDir)` or already running.
3. `beacon = readBeacon(siteDir)` (≤ 4 KB, parse errors → skip + `log.warn('ROUTINE_BEACON_UNREADABLE')`).
4. If `beacon.enabled > 0` → enqueue `startSiteBackend({siteDir, ctx}, {})` with concurrency 2, no window, failures logged (not dialogs).
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
| routines DB cannot open (corrupt/permission) | "Routines are unavailable because their data file could not be opened." | list `availability: 'error'`, admin banner; HTTP 503 | `ROUTINES_STORE_OPEN_FAILED` → admin `ERR-` id via `W/shared/admin-failure.ts` |
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
- No new tables. Ids minted **in the handler** (pure, J1-G3): `conversationId = 'routine-' + runId` and `userMessageId`, `assistantMessageId` from `newId()`; returned in `RoutineRunHandlerStart` so the claim row already links the real conversation (I23). If the chat history store cannot accept caller ids (builder checks `chatHistory` create API; STOP if neither supplied ids nor an idempotent create-by-key exists), fall back to persisting real ids right after creation (existing `persistPreparedIds`) and accept an orphan conversation on a crash in that window.
- `contextRef` payload (host envelope, sanitized by `redactAdminRunContextRef`): `{ conversationId, assistantMessageId, principalId, routine: { routineId, runId, catchUp, slotAt }, model? }`.
- In-memory: `settlements: Map<runId, { resolve, reject, stopWatch }>`.

### 2. Algorithm
**handler({routine, trigger, startedAt, runId, catchUp, slotAt})** — pure: mint ids; resolve nothing external. Returns `{ projectId: '', conversationId, agentRunId: '', completion, prepare, start, discard, discardUnstarted }` where `completion` is a deferred.

**prepare(run)** (after the claim):
1. `principal = owners.require(routine.creatorId)`; refused (creator no longer an owner) → throw `RoutineOwnerGoneError` → J1 records `failed` "The person who created this routine can no longer use the assistant."
2. `choice = agents.resolve({ agentId: routine.agentId, model: routine.model })` → `{ agentId, model }` or refusal: `AGENT_UNAVAILABLE` "The agent this routine uses isn't installed or signed in. Open AI Assistant settings to fix it." / `MODEL_UNAVAILABLE` "This routine's model isn't available for that agent." **No substitute agent or model** (I25). BYOK agents refused in v1 (OWNER-Q5). Codex refused while OWNER-Q6 stands.
3. `store = chatHistory({kind:'user', workspaceId, userId: principal.id})`; create conversation `conversationId` titled `"<routine name> · <local date time>"`; append user turn `userMessageId` whose text is the routine prompt, prefixed for catch-up with: "Catch-up run: this was scheduled for <slot local time> but Tovu was closed or the computer was asleep." (owner rule "say so"); append the assistant stub `assistantMessageId` (whatever `proxyAcceptedRun` expects to exist).
4. Record `agent_id_used`, `model_used` via `updateRun`.

**start()** (sync per J1 contract; kicks async work):
1. `acceptOwnerChatRun({ principalId, workspaceId, conversationId, messageId: assistantMessageId, agentId, model, contextRef })` — the **extracted, Express-free** acceptance binding (`W/server/runtime/composition/modules/assistant-run-acceptance.ts`, moved out of `proxyAcceptedRun`; the HTTP path becomes `parse → acceptOwnerChatRun → res.status(201)`). It uses the same `createRunAcceptance` + `createHttpRunDaemonClient({ensureReady})` + finalizer `attach`.
2. `null` result (not found) → settle `failed` "The routine's conversation could not be started."
3. Start `watchSettlement({ messageId })` → resolves the deferred with `{status, summary, error, errorCode}` mapped from the durable message's final `runStatus` (`completed→succeeded`, `failed→failed`, `canceled→canceled`); summary = last assistant text, whitespace-collapsed, ≤ 280 chars. Watch = finalizer settlement callback if it exposes one, else durable `poll` with backoff 1 s → 5 s (cap), stopped on settle or host close.

**discard / discardUnstarted:** resolve the deferred as `canceled` and stop any watch. Nothing to delete (no effect happened before the claim).

**onInterrupted({runs})** (J1-B hook, runs at host `enable()` **before** chat recovery): for each run with a non-empty `agentRunId`/assistant message → `durableStore.cancel({ runId, reason: 'routine-interrupted' })` so the chat recovery pass does not resume it (owner Q2 rec). Composition orders: `routineHost.enable()` is awaited before the chat module's `recoverInterrupted` boot work starts (STOP if that boot work cannot be sequenced).

Split points: `createRoutineRunHandler` (≤ 40 lines, returns closures), `mintRoutineIds`, `prepareRoutineConversation`, `resolveRoutineAgent`, `acceptOwnerChatRun`, `watchSettlement`, `mapSettlement`, `cancelInterruptedChatRuns`.

### 3. State machine
Same as J1 run lifecycle; the chat message's `runStatus` drives the transition out of `running`.

### 4. Concurrency + crash safety
- Acceptance is idempotent per `(conversationId, messageId)` (`accept.ts:20`), so a retried `start` can't launch twice; the daemon uses the stored attempt id as its idempotency key.
- Crash windows: see J1 §4 table; with pre-minted ids every row links its conversation.
- One principal throughout: `principalId` = `routine.creatorId` for store, acceptance, contextRef, finalizer (I22).

### 5. Failure modes and limits
Plain messages above; daemon not ready within the 30 s demand deadline → `failed` "The assistant service didn't start in time. The routine will run again at its next time." (`ROUTINE_DAEMON_UNAVAILABLE`). Watch poll ≤ 1 request / 5 s per active run.

### 6. Invariants → tests (`W/features/routines/__tests__/routine-run-handler.unit.test.ts`; integration through the real acceptance with two CLI adapter fakes: Claude, Codex — and agy in the Electron check)
- **I22** One principal throughout. Test: `one principal throughout`.
- **I23** The run row links the real conversation id from the claim onward. Test: `the result links the real conversation id`.
- **I24** An interrupted routine run is never resumed by chat recovery. Test: `interrupted after quit is recorded, not re-run`. Mutation: skip `cancelInterruptedChatRuns`.
- **I25** Unavailable agent/model fails with a plain reason and no substitute. Test: `unavailable agent or model fails with a plain reason and no substitute`.
- **I26** Routine runs go through owner-chat acceptance, not the executor. Test: `routine run uses acceptOwnerChatRun` (spy on the daemon client's `launch` via acceptance). Mutation: call the executor directly. Plus `claim loser starts nothing`.

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
`createRoutineApprovalObserver({ readRunEvents, persistence, now })`, fed by the same watch loop as T2 (one read per tick):
1. For each new event since the cursor: classify (pure `classifyApprovalEvent`):
   - surface emission carrying `__exchangeId = E` on the run-bound card → `open(E)`;
   - accepted-input receipt / tool result whose exchange id is `E` → `answered(E, confirmed: bool)` (`classifyConfirmationAnswer` semantics: only an explicit confirm is approved);
   - exchange `expired`/`abandoned` for `E` → `ended(E)`.
   Events for other exchange ids or ordinary tool results → ignored (I28).
2. `open(E)` → `setApproval({state:'waiting', ref:E, since: now})`.
3. `answered(E, true)` → `setApproval({state:'approved', expectedRef:E})`; `false` → `'declined'`.
4. `ended(E)` → `'expired'` (only if `ref = E`).
5. Run settles while `waiting` → J2 `markInterrupted`/terminal update rewrites `waiting → expired` (quit) — no consent inferred.
The effect itself runs inside `requireHumanConfirm` in the daemon; the observer never calls a tool, never retries, never answers.

### 3. State machine
`none → waiting(E)`; `waiting(E) → approved | declined` (owner answer via the existing card), `→ expired` (exchange ended or run ended), `→ waiting(E2)` (a new card). Terminal per exchange.

### 4. Concurrency + crash safety
- The card is run-bound and leased (`J/daemon/src/surface-exchanges.ts:125–128`): no idle deadline, so it waits with zero tabs. Another owner cannot answer: lease requires `lifetime.principalId === binding.principalId` and delivery checks `principalId` (I29).
- Quit while waiting → the daemon dies, the exchange is gone; on next boot J1-B marks `interrupted` + `expired` (I30).
- Codex 400 s deadline: see OWNER-Q6 — STOP rule kept: if any supported CLI ends a live leased approval before the owner answers, name file:line and fix in Jini first.

### 5. Failure modes and limits
Plain labels (T5): "Waiting for approval", "Approval declined", "Approval expired", "Interrupted". Observer read failures → retry next tick; never change state on a failed read.

### 6. Invariants → tests (`W/features/routines/__tests__/routine-approval.integration.test.ts`)
- **I27** With zero tabs the run waits and shows `waitingForApproval`; approving via the conversation runs the effect exactly once. Tests: `with zero tabs the run waits and shows waitingForApproval`, `opening the conversation and approving runs the effect exactly once`. Mutation: drop the run-bound lease (exchange expires at the idle TTL → red).
- **I28** An unrelated tool result does not clear waiting. Test: `an unrelated tool result does not clear waiting`. Mutation: clear waiting on any result.
- **I29** `decline leaves data unchanged`; `another owner cannot answer`.
- **I30** `quit → interrupted` (and `approval_state = expired`).

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
1. Parse + `validateSchedule` (+ timezone required for daily/weekdays/weekly; the description tells the model to ask). Invalid → `ToolInputError` "Choose a valid schedule." (nothing shown, nothing saved).
2. For set_enabled/delete: `current = commands.get(id)`; missing → "This routine no longer exists."; `current.revision !== input.revision` → "This routine changed since you looked. List routines again." (I33).
3. `outcome = await requireHumanConfirm({ctx, surfaces, spec})` with card fields Schedule, Prompt, Agent ("Agent default" when none), Model, and the note "This routine runs only while Tovu is open and your computer is awake". `!confirmed` → return "Nothing was changed." (I31, I32).
4. Re-check with `expectedRevision` inside the command (J2 txn) — a change during the card wait → refuse as in step 2.
5. Execute via `RoutineCommands` with `creatorId = ctx.principal.id`.
6. Return the row.
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

### 7. Wiring
`contributeRoutineTools({ commands, surfaces })` in `W/features/routines/routine-tool-registrations.ts`, registered at `tool-registrations.ts:495` / manifest; metadata registered in `nativeToolMetadata` (`index.ts:70`). Rebase on `ex5-fnd-inject` (approval type split) and `ex5-collections` (manifest). i18n keys from the plan in `approval-i18n.ts` (all locales).

---

## P3-T5 · Tovu · Routines admin screen

### 1. Data model
Client state only: `RoutinesViewState = { rows, availability, loading, error, editing: RoutineRow | 'new' | null, confirming: { kind: 'delete' | 'pause', row } | null }`.

### 2. Algorithm
1. `useRoutinesController` (injected prop) loads `GET /api/admin/assistant/routines`; refresh on window focus and every 30 s while the panel is visible (stop when hidden — bounded cost).
2. Render `DataTable` columns: name; schedule (hourly → "At :MM past every hour"; others show time + timezone); status (Paused / enabled); agent/model ("Agent default"); next run; last run (time, label from `lastRun`: `catchUp` → "Catch-up run", `approvalState='waiting'` → "Waiting for approval", `declined` → "Approval declined", `expired` → "Approval expired", `status='interrupted'` → "Interrupted"; **Open conversation** link).
3. `RowMenu` → Pause/Resume (PATCH with `revision`), Delete → `ConfirmDialog` → DELETE `?revision=`; 409 `ROUTINE_CHANGED` → "This routine could not be deleted because it changed. Reload and try again." and reload.
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

### 7. Wiring
Required hook props: `useRoutinesController`, `useSchedulePicker`, `useConversationDeepLink`, locale, theme, `t`; admin kit slots per P12 #6/#8. Must not import: `fetch` directly inside components (only via `routines-api.ts` passed into the controller), Jini daemon packages (UI imports `@jini-ai/ui` picker only).

---

## Execution notes for builders
- Order unchanged: J1 → J2 → (Jini artifact) → T1 → T2 ∥ T4 → T3 → T5; P8-T5 before T1. Feature hidden until T3 combined.
- Every new function ≤ 80 lines / complexity ≤ 10 at the named split points; no re-export shells (import `@jini-ai/daemon/routines/sqlite` directly).
- Electron check list from the plan stays; add: two desktop profiles on one site → one runs, the other shows "running in another Tovu window".
