REVISED r62t-rev-p3: 6 SOL sheets (3 Jini / 3 Tovu), 4 OPUS sheets

Verified changed anchors against Tovu `7c87b3c3f9` and Jini `010c8cd87`, both at their prefetched `origin/integ/merge-21-2026-11-24` tips. Locate existing code by symbol. `J/` means Jini `packages/`. `W/`, `A/`, `D/`, and `C/` mean Tovu `apps/website/src/`, `apps/admin/src/`, `apps/desktop/src/`, and `packages/contracts/`.

The screen stays in Tovu. There is no P3-T5.J commit and no daemon React export. Admin-assistant enablement is boot-only in v1. Keep the injected toggle seam for tests, but do not bind the public assistant setting to it.

The sheets are grouped by builder as requested. The cross-builder handoff is J1.J → J2.J → T2.J → consumable Jini artifact through P7-J2 → T1a.T → T1b.T. T2.T and T4.T take the T1a.T command and host contract. T5.T takes the T1a.T API contract and verifies the link after T3.T. Opus builds T3.J and T3.T together after T2.T, producing the updated Jini artifact before T3.T consumes it. P8-T5 is a prerequisite to T1. T4.T and T5.T remain dark through the combined verification.

Each sheet is one commit. Write the named tests first. Sol writes tests and records mutation proofs for Opus without running tests, builds, installs, type-checks, or generators. Opus owns the real migration pin, red/green and mutation verification, API and metadata guards, and generated baselines, catalogs, screen assets, and lockfiles at combine. Preserve why-comments with moved code. Use required and optional objects for new public functions, retain `_optional = {}` pads, and inject custom hooks as required props. Keep functions at most 80 lines and complexity at most 10, with the scheduler’s touched functions at most 50 lines. No re-export shells, inter-package implementation imports in Jini, framework or vendor coupling in Jini, or theme changes.

## Jini SOL sheets

### P3-J1.J — Durable scheduler and lease fencing

BUILDER: SOL

**Files.** Change `J/daemon/src/routines/{types,scheduler,index}.ts`. Add `durable-scheduler.ts` and `__tests__/scheduler.durable.test.ts` there. Preserve `scheduler.test.ts` and `scheduler.f1.test.ts`. Merge-21 anchors are `RoutineService`, `start`, `stop`, `claimRunRow`, `persistPreparedIds`, and `start_` in `scheduler.ts`, and `SchedulerPort` and `createTimeoutScheduler` in `J/daemon/src/scheduler.ts`.

```ts
type ReconcileReason = 'start' | 'wake' | 'enable' | 'edit'
type ClaimResult =
  | { claimed: true }
  | { claimed: false; reason: 'slot-moved' | 'disabled' | 'gone' | 'active-run' | 'lease-lost' }

new RoutineService(
  { persistence },
  { now, newId, timers, log, holderId, graceMs, maxArmMs, leaseTtlMs,
    policy, onInterrupted } = {}
)

start(_required = {}, { reason = 'start' } = {}): void
whenReady({}, _optional = {}): Promise<void>
reconcile({ reason }, _optional = {})
rescheduleOne({ routineId }, _optional = {})
setRunHandler({ handler }, _optional = {})
leaseState({}, {}): 'owner' | 'passive' | 'stopped'
quiesce({}, {}): void
drainActive({}, { timeoutMs = 2_000 } = {}):
  Promise<{ drained: boolean; pendingRunIds: string[] }>
stop({}, { releaseLease = true } = {})
```

**Contracts.** Keep legacy synchronous start/stop and select the legacy strategy when `claimDueSlot` is absent. `start` returns `void` on both paths. `whenReady` resolves immediately in legacy mode and, in durable mode, after acquiring the lease and running boot interruption work. A passive start remains passive and retries independently of callers waiting for readiness. Throw at construction if `claimDueSlot` is present without `holderId`. Type `timers` as `SchedulerPort`, default to `createTimeoutScheduler({}, {})`, and replace the direct `clearTimeout` in `stop` at `scheduler.ts:121` with the cancel function returned by the port. Store and use the same idempotent cancel function at the other touched timer cancellation sites.

Default to 60,000 ms grace, 300,000 ms maximum timer arm, and 90,000 ms lease TTL. Inject clock, IDs, timers, boot holder, diagnostics, and `onInterrupted({ runs }, {})`. Default `policy.activeSlotVisibility` to `'diagnostic-only'` and `policy.catchUpOnAssistantEnable` to `false`.

Add `interrupted` to `RoutineRunStatus`. Keep new fields optional on legacy rows and required in normalized `DurableRoutine` and `DurableRoutineRun`. Routine fields are `revision`, `creatorId`, and `model`. Run fields are `catchUp`, `slotAt`, `holderId`, `approvalState`, `approvalRef`, `approvalSince`, and `assistantMessageId`. Pass `{ routine, trigger, startedAt, runId, catchUp, slotAt }` to the handler. Its start handle can supply the assistant message ID before claim and the accepted attempt ID after dispatch. Do not make legacy handlers or completion depend on a database.

`RoutineDurablePersistence` extends the synchronous port with:

- `claimDueSlot({ routineId, expectedNextRunAt, nextRunAt, run, holderId, now }, {})`
- `setNextRunAt({ routineId, expected, nextRunAt, holderId, now }, {})`
- `listInFlight({ excludeHolderId? }, {})`
- `markInterrupted({ runIds, now, holderId }, {})`
- `acquireLease({ holderId, now, ttlMs }, {})` and `releaseLease({ holderId }, {})`

Require an atomic holder check for durable manual insertion too. Keep `active-run` distinct from `lease-lost`. Manual conflict surfaces as `RoutineActiveError`.

**Build.**

1. Split `classifySlot`, `applySlotDecision`, `arm`, `onTimer`, `fireSlot`, `rearmFromStore`, `reconcileInFlight`, and claim strategy. Acquire the lease or go passive and retry after the TTL without arming routine timers. Preserve the originating `start` or `enable` reason. On ownership, mark stale in-flight rows and await `onInterrupted` before arming. If the hook rejects, log `ROUTINES_INTERRUPT_HOOK_FAILED` and still arm. The durable chat admission barrier prevents generic recovery from relaunching a routine. Heartbeat at TTL/3. If renewal returns false, fence new claims and log `ROUTINES_LEASE_LOST`.
2. Arm a stored future slot as-is. Seed null with CAS. A due slot within grace is ordinary. An overdue slot beyond grace fires one catch-up, except `enable` advances without firing under the default. Re-arm with `clamp(slotAt-now, 1_000, maxArmMs)` and advance from `max(now, slotAt+1)`. Check generations at timer entry and immediately before claim after any awaited handler work. Reload on a lost CAS and cancel the cached timer for a missing row.
3. The pre-claim handler only mints IDs and closures. The DB consumes a due slot even if a previous run is active. The winner sets the active entry, prepares, persists prepared IDs, wires completion, and starts. A loser calls `discardUnstarted` exactly once without prepare or start. Keep the winning entry until terminal persistence, then remove it only if the stored run ID matches. Preparation or launch failure settles the winning row, not a later slot. A concurrent manual insert loser returns conflict.
4. Retry the same slot after `ScheduledRunPersistenceError` at 1, 2, 4, 8, and 16 seconds while still owner and generation-current. Log `ROUTINE_SLOT_PERSIST_FAILED` on exhaustion and use a bounded reread/re-arm. Do not recurse immediately into the exhausted slot. `quiesce` fences new claims but keeps the lease and heartbeat. `drainActive` uses the injected clock and timers. `stop` invalidates generations and cancels timers and retries, releasing the lease when requested.

**Tests first.** Pair each mutation with its proof.

| Test | Mutation |
|---|---|
| `restart after three missed slots fires once with catchUp and schedules the next future slot` | Ignore the stored slot on boot. |
| `20 ms late timer is not catch-up` | Treat all positive lateness as catch-up. |
| `paused routine's old timer does nothing` | Drop the generation check. |
| `claim loser creates no conversation` | Prepare before claim. |
| `pending run across the next slot consumes it without a second run` | Remove active-slot advance. |
| `crash after claim records Interrupted and keeps the next slot` | Skip boot interruption. |
| `lease lost while handler awaits: claim returns lease-lost, prepare never called` | Drop the holder check in `claimDueSlot`. |
| `heartbeat renew false stops claims and logs ROUTINES_LEASE_LOST` | Ignore the heartbeat result. |

Also write `wake reconcile fires once; a second wake does not`, `lost claim reloads and does not run`, `clock set back one hour re-arms and does not refire the same slot`, `late timer and wake reconcile race produce one run`, `re-enabling the assistant skips overdue slots without running`, `passive start arms no timers and retries after leaseTtlMs`, and `passive process never marks the owner's in-flight runs interrupted`. Assert quiesce retains the lease through the drain and a rejected interruption hook logs and still arms.

**Why and release.** Durable slots are truth, timers are cache. A claim precedes chat effects. Active means through settlement. Generations and the lease fence different races. Keep the existing daemon root export. Add a daemon minor changeset calling out exhaustive `RoutineRunStatus` consumers and refresh the daemon API baseline at combine.

### P3-J2.J — SQLite store, ADR-066 migration, and routine routes

BUILDER: SOL

**Files.** Add `J/daemon/src/routines/routine-store.sqlite.ts`, `routine-store.sqlite-schema.ts`, `migrations/{0001_jini_routines_v1,index,checksums}.ts`, `__tests__/routine-store.sqlite.test.ts`, and `__tests__/routines-migration-pin.test.ts`. Change `routine-store.ts`, `J/daemon/src/http/{routines,index}.ts`, the HTTP routines tests, and the daemon manifest. Add `J/core/src/contracts/site/routines.ts` and its universal entry. Change `J/core/src/contracts/server/api-error.ts` and its status-map test for 507.

```ts
createSqliteRoutineStore(
  { db, scope },
  { now, newId, holderId, schemaSetup = 'host', historyLimit = 100 } = {}
): { store: RoutineStore; persistence: RoutineDurablePersistence }

create({ name, prompt, schedule, target, enabled, ...fields }, { creatorId, ...options } = {})
get({ id }, _optional = {})
list({}, _optional = {})
update({ id, patch }, { expectedRevision } = {})
setEnabled({ id, enabled }, { expectedRevision } = {})
delete({ id }, { expectedRevision } = {})
listRuns({ routineId }, { cursor, limit } = {})
setApproval({ runId, state }, { ref, expectedRef, since } = {})
```

**Migration.** Follow the verified Jini precedent `J/commerce/src/payments/ledger/migrations/index.ts:20–85` and its `checksums.ts`. `0001_jini_routines_v1.ts` exports `jiniRoutinesV1({ checksum })` with an optional-object pad, returning a core `MigrationStep` whose `up(kernel)` runs the DDL. `migrations/index.ts` exports `JINI_ROUTINES_LEDGER_TABLE = 'jini_routine_migrations'`, `pinnedChecksum({ id }, {})`, `JINI_ROUTINES_MIGRATIONS`, and `migrateJiniRoutines({ kernel, runMigrations }, _optional = {})`. The host injects `@jini-ai/db/migrate`’s `runMigrations`. The ordered step array and its dedicated ledger are the history. Do not add `journal.ts`, `when`, a Drizzle entry, `PRAGMA user_version`, or a second DDL source. Retain the node entry’s `SQLITE_ROUTINES_SCHEMA` export from that one source, with the migration runner as the boot path.

Pin the normalized source SHA-256 with comments stripped and whitespace collapsed. Sol leaves a placeholder. Opus generates the real pin, verifies it with the pin test, and checks the migration source contains no `VACUUM`. The adapter is host-only, with no `'ensure'` mode. Refuse a missing or mismatched `0001_jini_routines_v1` ledger stamp or unsupported future history. The host owns pragmas and close. Both adapters share the borrowed `SqliteDb` and prepared statements. No SQLite driver or DB runtime import in the implementation. Rollback means disable and retain the sidecar.

**Rows and invariants.** Move the unchanged `RoutineSchedule` shape to core along with the shared `RoutineRow`, `RoutineRunSummary`, and `RoutineAvailability` contracts. Keep the existing daemon public type path compatible. Create:

- `jini_routines` with composite `(scope,id)`, name, prompt, schedule and target JSON, skill/agent/model/context, immutable creator, enabled, next slot, revision, timestamps, and tombstone.
- `jini_routine_runs` with scoped key and routine FK, trigger/status, catch-up/slot/holder, project/conversation/attempt/assistant message IDs, actual agent/model, completion/summary/error, and approval state/ref/since.
- `jini_routine_leases` with scope key, holder, and expiry.

Index live rows by `(scope,created_at,id)`, history by `(scope,routine_id,started_at DESC,id DESC)`, and enforce unique non-null scheduled slots and one active row per routine. Scope every routine data statement. Use immediate writes. Claim verifies the lease, live/enabled state and expected slot, then advances and inserts atomically. If already active, commit the advance only and return `active-run`. A duplicate-slot race rolls back the advance. Do not misclassify other constraint failures. Manual insert requires a live row and a valid holder and is enabled-agnostic. Check revisions in the same transaction as edits/delete. CRUD increments revision, slot advancement does not. Schedule/state changes seed or clear the slot. Soft delete keeps history links.

Expire unresolved approval on terminal settlement. Never overwrite `interrupted` with late completion. Use the exact approval predicate:

```sql
WHERE scope=? AND id=? AND status='running'
  AND (:expectedRef IS NULL OR approval_ref = :expectedRef)
```

A new waiting exchange can replace the old ref. A later answer or end requires a matching `expectedRef`. Acquire or renew only for the same holder or an expired lease. Foreign interruption requires valid takeover. Explicit shutdown may interrupt current-holder rows. Retain the newest 100 runs per routine, protecting active rows. Pruning deletes routine run rows only, never conversations. Cap live routines at 200 and history pages at 50. Strictly validate the base64url `{s,i}` keyset cursor.

**Routes.** Keep `routineRoutes({ deps, host }, {})` and the legacy specs/response behavior on `J/server/src/builtin-features.ts:632`. The legacy pack passes no creator. The in-memory store keeps `creatorId` optional. Durable creation requires a creator resolved by the host, never the body. Add these seven factories to existing `./http`:

- `createRoutineListRoute({ path, copy }, {})`
- `createRoutineCreateRoute({ path, copy }, {})`
- `createRoutineGetRoute({ path, copy }, {})`
- `createRoutineUpdateRoute({ path, copy }, {})`
- `createRoutineDeleteRoute({ path, copy }, {})`
- `createRoutineRunNowRoute({ path, copy }, {})`
- `createRoutineRunsRoute({ path, copy }, {})`

Each returns a core `defineJsonRoute` spec with narrow per-route deps. Create feeds the host’s `ports.authenticate` context into `resolveCreator({ context }, {})`. A null creator returns 401 `UNAUTHORIZED`. `RouteInputContext` is parse input, not identity. Use host-injected defaults and copy, existing schedule validation, optional nullable `agentId` and `model` strings, and a 200-character model bound. Accept positive safe-integer `expectedRevision` in PATCH and `?revision=` for DELETE. Prefer persisted `nextRunAt` if no timer is armed. Mark the four writes `requireSameOrigin`.

| HTTP | Core code | `details.reason` |
|---|---|---|
| 400 | `BAD_REQUEST` | `INVALID_SCHEDULE` or `ROUTINES_LIMIT` |
| 401 | `UNAUTHORIZED` | No trusted creator |
| 404 | `NOT_FOUND` | `ROUTINE_NOT_FOUND` |
| 409 | `CONFLICT` | `ROUTINE_CHANGED` or `ROUTINE_RUN_ACTIVE` |
| 503 | `SERVICE_UNAVAILABLE` | `ROUTINES_UNAVAILABLE` or `ROUTINES_BUSY` for `SQLITE_BUSY` |
| 507 | `INSUFFICIENT_STORAGE` | `ROUTINES_DISK_FULL` for `SQLITE_FULL` |

Add and test `INSUFFICIENT_STORAGE: 507`. Unknown exceptions use the host’s redacted error path.

**Tests first.** `reopen keeps routines and nextRunAt`, `claim and advance roll back together`, `duplicate claim loses`, `scope isolation`, `pause clears nextRunAt, resume sets the next future slot`, `delete keeps run history links`, `concurrent pause versus claim`, `late completion does not overwrite interrupted`, `CRUD write is visible to the scheduler adapter`, `update cannot change creator`, and `old exchange answer cannot clear a newer waiting ref`. Cover pin mismatch, missing stamp, second-handle takeover, stale-holder manual insert, scope-isolated pruning with conversations retained, and both SQLite refusal codes. Add `POST ignores body ownerId and uses resolveCreator`, missing authenticated creator, `POST accepts optional model and agentId`, and legacy no-creator creation. Mutate split claim/advance, body creator trust, and dropped `agentId`. Real driver in tests only.

**Why and release.** The borrowed handle and separate ledger preserve host ownership. Soft delete preserves links. Claim, advance, and eligible prune share one transaction. Add daemon `./routines/sqlite` as a `node` entry using `./store/event-log/sqlite` as the manifest precedent. Point it to the implementation, not a forwarding entry. Add core universal `./contracts/site/routines`, daemon/core minor changesets and API baselines. Opus verifies the pin, replay, retention, scope predicates, and metadata guard before the artifact ships.

### P3-T2.J — Durable chat boot recovery admission

BUILDER: SOL

**Files.** Change `J/chat/src/core/durable-runs/ledger-contracts.ts:17–21` (`ChatRunRecoveryOptions`) and `J/chat/src/store/runtime/run-ledger.ts:296–310` (`reconcileInterrupted`). `lazy-run-ledger.ts:28–30` already forwards both objects. Keep it forwarding them and pin the behavior in its existing test. Extend `J/chat/src/store/runtime/__tests__/run-ledger.cov-j2.test.ts`. Do not add the admission to `run-finalizer.ts`.

```ts
admit?: (
  required: { turn: InterruptedChatTurn },
  optional?: Record<string, never>
) => Promise<'recover' | 'leave-owned'>
```

Construct the existing `InterruptedChatTurn` once from the stored row. No `head` on this new port. Before `optional.recover?.(...)`, add `if ((await admitSafely(turn)) === 'leave-owned') continue;`. A skipped turn is not counted, recovered, or canceled by fallback. If admission throws, log the failure without prompt or context and treat it as `leave-owned`. Admission runs outside the write transaction. Without an admission port, preserve the existing adoption and fallback behavior. The host decides which runs it owns.

**Tests first.** `leave-owned neither dispatches recovery nor invokes fallback`, with count unchanged. Add rejection treated as `leave-owned` and ordinary interrupted chat recovery without an admission port. Mutate the ordering by calling recovery before admission.

**Why and release.** The host can own a class of runs whose lifecycle must not race generic boot repair. Add a chat minor changeset and refresh its API baseline. No new subpath or Tovu policy in Jini.

## Tovu SOL sheets

### P3-T2.T — Routine runs use normal owner-chat acceptance

BUILDER: SOL (OPUS-REVIEW)

**Prerequisites and files.** Consume Jini P3-T2.J and the T1a.T host contract. Add `W/features/routines/routine-run-handler.ts`, its `__tests__/routine-run-handler.unit.test.ts`, and `W/server/runtime/composition/modules/assistant-run-acceptance.ts`. Change `modules/{assistant,assistant-chats,assistant-routines}.ts`, `modules/run-finalizer/entry.ts:99,285–286`, `http-app/mount-assistant.ts`, `W/assistant/run-start-context.ts`, `W/server/inbound/assistant/agent-daemon-run-{start,tool-access}.ts`, and `C/src/routines.ts`. Extend the existing serving boot-repair test.

```ts
createRoutineRunHandler({
  owners, agents, chatHistory, runStarter, updateRun, now, newId,
  localeTime, catchUpText, agentPolicy
}, _optional = {}): RoutineRunHandler

acceptOwnerChatRun(
  { principalId, workspaceId, conversationId, messageId, context },
  { agentId, routine } = {}
)
watchSettlement({ principalId, workspaceId, messageId }, { cursor, onEvents, signal } = {})
cancelChatRun({ principalId, workspaceId, conversationId, messageId }, { reason } = {})
```

`assistant-run-acceptance.ts` owns all three owner-chat functions. Move the binding and why-comments out of `proxyAcceptedRun` in `modules/assistant.ts:172–196`. Keep HTTP parsing, auth and 201/404 behavior at the route. Reuse the existing `createRunAcceptance`, sanitizer, tracking, `createHttpRunDaemonClient` with demand readiness, and finalizer attachment. Routine code never calls an executor directly.

1. The handler mints `conversationId = "routine-" + runId`, user and assistant message IDs, and a deferred completion. Return the claimed IDs and `prepare`, `start`, `discard`, and `discardUnstarted` closures without external reads or writes. On a claim loss, resolve canceled and dispose anything in memory. There is no conversation to delete.
2. After claim, re-resolve the persisted creator as a current owner in that workspace. Validate the explicit or default eligible local CLI against `listAssistantAgents`, signed-in status, availability and model inventory. No replacement for an explicit unavailable agent or model. No BYOK. Default-refuse Codex with “Codex can't run routines yet. Choose another agent.” Carry the pinned agent/model through preparation and dispatch, record the actual choice, and apply a strict routine branch before interactive alternative logic in daemon tool access.
3. Use the creator’s `chatHistory({ kind:'user', workspaceId, userId })`. Create the titled conversation with its supplied ID, append a redacted user turn and the ordinary assistant stub, and refuse on a null write before launch. For catch-up, add the consumed slot’s local time and the explanation that Tovu was closed or asleep to both durable text and the guarded prompt. A link during preparation may resolve to nothing. It must never create a conversation.
4. `acceptOwnerChatRun` deletes any browser-supplied `context.routine` and adds it back only from the trusted `routine` optional field. `proxyAcceptedRun` never passes `routine`. Strip it before the browser’s non-durable proxy fallback too. The rebuilt accepted context includes required `prompt`, trusted identity and message bindings, optional `model`, and trusted `{ routineId, runId, catchUp, slotAt }` under `routine`. Model stays in the context envelope. Validate the marker in the daemon decoder and compare it with persisted run and user context when using it for recovery. Persist the accepted attempt ID, but use the stable assistant message ID to bridge a crash before the attempt write. Retries reuse the same accepted message.
5. Watch the owner-scoped durable poll, or scope-check `head` by message ID before acting. Back off from 1 to 5 seconds and share one read per tick between settlement and the optional event observer. Map `completed` to `succeeded`, preserve failed/canceled, and collapse the summary to at most 280 characters. Use plain owner/agent/model/startup failure messages. An ambiguous dispatch timeout after commit is not proof the effect did not run and is not permission to create another attempt.
6. Install recovery admission on every serving boot that invokes chat repair, including web-only, assistant-off policy when recovery is invoked, passive desktop, and a failed or missing routine sidecar. The decision uses the trusted marker in the accepted durable request, not routine DB availability or a browser field. Check the durable owner, workspace, conversation and current message before using the marker. Thread `admit` through the finalizer interface at `entry.ts:99` and forward it beside the hard-coded `recover` at `:285–286`. At `assistant-chats.ts:129`, wait for the routine boot interruption barrier if this process is the current lease owner. A passive or no-slot boot must not wait for a retry to win a lease. Cancel interrupted owned turns using saved assistant message ID and the scoped current attempt, leave the next routine slot intact, and reserve routine turns from generic recovery even if cancellation failed. Nonroutine and non-serving boot behavior stays unchanged.

**Tests first.** `one principal throughout`, `the result links the real conversation id`, `claim loser starts nothing`, `unavailable agent or model fails with a plain reason and no substitute`, `interrupted after quit is recorded, not re-run`, `routine run uses acceptOwnerChatRun`, `browser-supplied context.routine is stripped`, and `web-only boot leaves a routine turn unrecovered`. Cover crash after acceptance before attempt-ID persistence, passive boot, browser proxy fallback, and ordinary repair with no routine. Use Claude and Codex adapter fakes through the common acceptance seam, with a test-only Codex override and a separate production-default refusal. Mutate skipped interruption cancellation/admission, retained browser marker, and direct executor invocation. Opus reviews the marker-stripping and admission tests explicitly.

**Why and release.** Acceptance commits before launch. The assistant message is the idempotency identity. Generic recovery does not own routine turns. Existing chat/daemon subpaths and `@tovu/contracts` wildcard only. No Tovu changeset or API baseline.

### P3-T4.T — Routine tools over the serving-site federation

BUILDER: SOL

**Prerequisites and files.** Take T1a.T’s serving-site commands, owner gate and `ROUTINES_RELEASE_ENABLED`. Add `W/features/routines/routine-tool-registrations.ts`, `__tests__/routine-tool-registrations.unit.test.ts`, and `W/contracts/core/tool-metadata/routines.ts`. Change `W/contracts/core/{tool-metadata/index,approval-i18n}.ts`, `W/assistant/{tool-registrations,byok-tool-surface}.ts`, `W/server/runtime/composition/{tool-catalog-manifest,http-app/mount-assistant,modules/assistant-byok}.ts`, and the allowlist completeness test. No routine store or copied registry in the daemon.

```ts
contributeRoutineTools({
  commands, surfaces, validateSchedule, requireHumanConfirm,
  resolveOwnerActor, availability, copy
}, _optional = {})
```

**Exact wiring.**

- In `tool-registrations.ts`, feed the `routines` contributor through the existing `options.contributions` at `buildAssistantToolRegistrations`. Build it through `collectDomainRegistrations` with the same `guardedSurfaces` that include `assertAccessApprover`. Include the four IDs in its domain risk map and existing duplicate/metadata validation. Do not add a second static registration, host singleton, or alternate approval wrapper.
- In `tool-catalog-manifest.ts`, add a `routines` field to `installFirstPartyToolContributors`’ existing options. Register the bound contributor only when the host supplies that field. In `assistant-byok.ts:536–551`, pass it into that call before `createByokToolSurface`. Feed it from serving `mountAssistant` using the exact T1a.T command instance already used by the admin routes. Bind `ROUTINES_RELEASE_ENABLED` once in Tovu composition and pass it in, off by default.
- Keep one registry. At `byok-tool-surface.ts`’s `createRun` and `createSurfaceDaemonCalls.listToolsFor`, filter routine discovery for the authenticated current owner and ready site, and omit the four IDs from unbound/global and visitor views. Recheck authority and readiness on invocation even if the descriptor was visible earlier. Preserve the token-bound site tool RPC and catalog revision mechanism.
- Add routine metadata to `nativeToolMetadata`. Extend `W/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` to account for all four IDs under the `requireHumanConfirm` scan documented at `W/contracts/core/human-confirm.ts:85–88`. Pin create, set-enabled and delete as card-opening/redeemable, and list as the read-only, non-redeemable case. Do not add list to the callback allowlist. Verify at execution that `J/core/src/contracts/site/tool-metadata-approval-policy.ts` extends a `ToolApprovalMetadata` permitting `confirmation:'direct'|'policy'` and `class:'edit'`. This was verified on merge-21 in `J/core/src/tool-metadata-types.ts:3–4`. STOP if the executor’s base lacks them.

**Handlers.** `routine_list({})` is `{ class:'read', confirmation:'direct' }`. `routine_create({ name,prompt,schedule,agentId?,model? })`, `routine_set_enabled({ id,enabled,revision })`, and `routine_delete({ id,revision })` are `{ class:'edit', confirmation:'direct' }` and each opens the existing human confirmation card inside the handler. Do not use `'policy'` or let remembered grants bypass the card. Resolve the actor from trusted execution context before disclosure. Validate schedule, including a timezone for daily/weekdays/weekly, and read the exact revision for state/delete. The card includes Schedule, Prompt, Agent, Model, and the desktop availability note. Decline or missing channel means “Nothing was changed.” After explicit confirmation, revalidate the owner and use the transactional `expectedRevision` on the shown row. Stale means “This routine changed since you looked. List routines again.” Do not auto-retry.

Describe a routine as a recurring AI job that runs only while Tovu desktop is open and the computer is awake. Hourly schedules select a minute past the hour. Daily and weekly schedules require a timezone. Localize `Create routine`, `Pause routine`, `Resume routine`, `Delete routine`, `Schedule`, `Prompt`, `Agent`, `Model`, and `This routine runs only while Tovu is open and your computer is awake` in all approval locales.

**Tests first.** `create opens the card before saving`, `delete opens the card before deleting`, `decline saves nothing`, `policy cache cannot skip routine cards`, `stale row on delete is refused`, and `visitors never see the tools`. Cover a revision change and owner revocation while the card is open, unbound discovery, release flag off, and the four metadata/allowlist cases. Mutate create before the card and delete before the card separately. Keep golden catalog names and bytes tests. Regenerate only at exposure after T3.

**Why and release.** Direct metadata means the handler owns the card. Revision CAS protects what the owner saw. The site owns the command and the daemon transports the authorized call. No new manifest dependency, Tovu changeset, or API baseline.

### P3-T5.T — Tovu Routines screen and authorized conversation deep link

BUILDER: SOL

**Prerequisites and files.** Build against T1a.T’s routes and `ROUTINES_RELEASE_ENABLED`. Keep the screen dark and verify its deep link after T3.T. Add `A/features/routines/index.ts`, `Routines.tsx`, `Routines.hooks.ts`, `RoutineForm.tsx`, `RoutinesMount.tsx`, `routines-api.ts`, `routines-i18n.ts`, `project-routine-row.ts`, `use-conversation-deep-link.ts`, and `__tests__/Routines.test.tsx`. Put host binding code in `index.ts`, not a re-export shell. Change `A/panels.tsx`, `A/App.tsx`, `A/App.chrome.tsx`, `A/components/AssistantDock/AssistantDock.tsx`, `A/components/AssistantDock/AssistantDock.state.hooks.ts`, `A/lib/admin-http/request.ts`, and `A/integrations/jini-kits.ts` for the structural kit binding only. Add the dock deep-link integration test and update existing dock fixtures for the required props.

```ts
createRoutinesApi({ requestAdminJson, basePath }, _optional = {})
RoutinesMount({ useAdminLocaleHook, useRoutinesController, useSchedulePicker,
  useConversationDeepLink, kit, visible }, _optional = {})
Routines({ useRoutinesController, useSchedulePicker, useConversationDeepLink,
  kit, locale, theme, t, visible }, _optional = {})
RoutineForm({ row, onSave, onCancel, useSchedulePicker, kit, locale, t }, _optional = {})
useRoutinesController({ api, visible, focus, timers }, _optional = {})
projectRoutineRow({ row, locale, t }, _optional = {})
useApplyConversationDeepLink({
  query, chats, lookupConversation, replaceQuery, notify, openDock, principalId
}, _optional = {})
```

**Screen.** Bind `DataTable` and `RowMenu` from `@jini-ai/admin/react`, `ConfirmDialog` from the host kit, and `RecurringSchedulePicker` with `useRecurringSchedulePicker` from Jini UI at the mount. The screen’s required `useConversationDeepLink` supplies the authorized-detail URL builder, not a selection effect. All new custom hooks are required props. Inject theme, locale, translator, visibility/focus, timers, and session-aware request. Add the single literal `/api/admin/assistant/routines` to `AdminApiBasePath` rather than widening the client to arbitrary origins. No direct component `fetch`, daemon React import, or new dependency on the admin package.

The API implements list, create, update and delete, sending `expectedRevision` on PATCH and `revision` on DELETE. Normalize known 503 reasons to non-ready availability and retain the admin `ERR-` ID in toast detail. A refusal is not an empty ready list. Load on show, refresh on focus and every 30 seconds while visible, and cancel timers and discard stale results on hide/unmount. Show name, schedule and zone, pause status, agent/model, next and last run, outcome time and labels, and an Open conversation link. Show both catch-up and approval when present. An affirmative receipt says **“owner said yes”**, not “done”. The subsequent grant recheck or effect can still fail. Use the injected picker in the form and the kit for keyboard menu, pause confirmation and delete confirmation. On a stale write, show the reload message and refresh without resubmitting. Non-ready screens have no mutation actions.

**Panel and dock.** Add `/routines` next to AI Assistant in `PANELS`, gated by the same Tovu release flag so `ADMIN_PANELS`, navigation, and route visibility agree. Extend the `ai-assistant` query allowlist at `panels.tsx:191–197` to `{ tab:null, conversation:null }`. In `App.tsx`, pass the parsed query for that panel, and `null` for other routes, through `AssistantChrome` to `ChatDockAside` in `App.chrome.tsx:65,124`, then through the existing `AssistantDock`. Make `query: URLSearchParams | null` and the new deep-link hook required props. `AssistantDock.tsx:226–227` forwards the props to **`useAssistantDockState`** in `AssistantDock.state.hooks.ts:288`. That hook uses the `chats` returned by `useDockTransport`/`useChatsSeam`, rather than mounting a second controller.

When the authorized principal is ready, resolve the ID against the current owner-scoped conversation list read, `listConversations` at `A/lib/assistant-chats.ts:44–60`. Use the read result for admission, not `select`, which returns `void`. A valid query opens the existing dock if closed and calls `chats.select({ id }, {})` once. Fence stale lookups on query or principal change. On missing/inaccessible, show “This conversation is no longer available.” and replace the URL, clearing only `conversation` and preserving `tab`. Do not treat a transient fetch error as proof of absence. Never create a conversation, send a message or start a run. Ignore a `conversation` parameter on unrelated routes.

Localize the screen in all admin locales, including `Routines`, `New routine`, `No routines yet`, `Last run`, `Next run`, `Never run`, `Paused`, `Agent default`, `Catch-up run`, `Waiting for approval`, `owner said yes`, `Approval declined`, `Approval expired`, `Interrupted`, and `Open conversation`. Include the desktop-only instruction, save failure and stale delete copy from the plan. Prefer the specific assistant-off, other-window or store-error message when that reason is known.

**Tests first.** `shows Waiting for approval and Catch-up run labels`, `pause/resume and delete with cancel`, `hourly shows minute past the hour, daily shows its timezone`, `menu works by keyboard`, `conversation deep link selects it without starting a run`, `deep link after reload selects the authorized conversation`, and `missing or inaccessible conversation shows a notice and launches nothing`. Also pin affirmative receipt versus completion, an owner-change race, unrelated query keys, release flag off, and no polling while hidden. Mutate missing approval projection and link without select. Keep the generated screen catalog and mounting assertions for combine.

**Why and release.** Poll only while visible. A link selects an authorized existing record. No Jini browser entry, lockfile work for a React entry, changeset, or Tovu API baseline.

## OPUS sheets

### P3-T1a.T — Verified serving-site host, routes, sidecar, and beacon

BUILDER: OPUS

**Prerequisites and files.** Require P3-J2.J consumable through **P7-J2** and existing daemon-demand/idle-park recovery from **P8-T5**, as pinned in the planning branch’s `INDEX.md:35`. Add `W/features/routines/{routine-commands,routine-host,routines-paths}.ts`, `README.md`, `W/server/runtime/composition/modules/assistant-routines.ts`, and `W/platform/db/sqlite/routines-db.ts`. Add `C/src/routines.ts` for host command/session/IPC shapes using core shared row types. Change `W/index.ts`, `W/server/runtime/boot/local-owner-signin.ts`, `W/server/runtime/composition/{deps,serving-app,create-app-options}.ts`, and `http-app/mount-assistant.ts`. Pin the private path in backup, publish and portable selectors with exclusion tests. Desktop boot and wake are T1b.T.

```ts
composeAssistantRoutines({
  launch, workspaceId, contentDbPath, openSqlite, beforeStoreClose, onStoreClose,
  assistantEnabled, onAssistantToggle, runStarter, approvalObserver, mountAdminRoute,
  now, newId, timers, log, writeBeacon, policy
}, _optional = {})

createRoutineCommands({
  store, service, access, onCommandCommitted, availability, target
}, _optional = {})

type RoutineActor = Readonly<{ principalId: string; workspaceId: string }>
type RoutineAccess = (
  required: { actor: RoutineActor },
  optional?: Record<string, never>
) => Promise<boolean>
type RoutineTarget = Readonly<
  { mode: 'create_each_run' } | { mode: 'reuse'; projectId: string }
>
```

**Defaults.** The production `access` binding requires the mounted workspace and live owner authority, using the identity `principalHoldsOwnerWildcard` contract already used in `dev-auth.ts:573–576`. If no access binding is available, deny. A session is not itself proof of ownership. Default `target` to `{ mode:'create_each_run' }` from host composition and do not allow a Tovu caller body to override it. `runStarter` refuses and settles `failed` with “Routines are not ready yet.” until T2.T installs owner-chat acceptance. `approvalObserver` is `{ observe: async () => {} }` until T3.T. The production `onAssistantToggle` is `() => () => {}`, seeded from `isAdminAssistantEnabled(env)`. Do not wire the public assistant switch or poll env. Define **`ROUTINES_RELEASE_ENABLED`** as one default-false Tovu rollout value shared by the server and admin builds. Inject it at the host roots for this host, desktop background start, T4.T and T5.T. The false default keeps the feature dark in production while tests opt in.

**Build.**

1. Add required `routineDesktopEligible: boolean` to `LocalOwnerSignInPolicy` at `local-owner-signin.ts:9`. Set true only in `localOwnerAcceptedPolicy`’s desktop branch at `:40`, after capability, launcher parent, deployment, listener, and origin checks. Every deny and dev-only return is false. Read `bootLocalOwnerSignIn` once in `W/index.ts` near `servingOptions:321` and pass it into `createServingApp`. Pass only the needed eligibility to `composeAssistantRoutines`. Never import the singleton in `assistant-routines.ts` or reread the scrubbed environment there. Attached, standalone, static/export, and ineligible boots cannot open the routine DB or arm timers.
2. Resolve `<dirname(contentDbPath)>/ops/routines.db` from the actual content path. Open it on its own connection with WAL, `busy_timeout=5000`, and foreign keys. Use Tovu’s SQLite kernel/borrowed-handle boundary in `W/platform/db/kernel/drivers/sqlite.ts:28,43`. Inject DB’s `runMigrations` into Jini’s `migrateJiniRoutines` on that kernel before handing the borrowed handle to the host-mode store. Use the workspace scope and a distinct boot holder. Follow `site-deps/database-journal.ts:23–33` for opening and closing the independent sidecar. Use the existing `deps.ts:74,88` hooks, `beforeStoreClose({ drain }, {})` and `onStoreClose({ registration }, {})`. Quiesce, keep the heartbeat, drain for at most two seconds, mark unresolved rows interrupted and waiting approvals expired, dispose watchers, then release the lease. Close the borrowed connection only in the close registration. Sidecar-open failure leaves the site up and returns a plain unavailable response with the admin `ERR-` ID.
3. On enable call `start({}, { reason })`, and await `whenReady({}, {})` in owning initialization. A passive process reaches `other-window` without blocking boot on its retry. Expose the bounded initial boot-repair handoff to T2.T. On disable, fence new claims, allow active chats to finish, write the disabled beacon, and release after the watches drain unless re-enabled. Never arm on an assistant-off first boot. Keep the scheduler in the serving site process. Do not add a routine idle hold to `createSiteScope`. A live run already holds daemon activity and the demand path handles a parked daemon.
4. Bind the seven Jini factories to `/api/admin/assistant/routines`, `/:id`, `/:id/run`, and `/:id/runs` when exposure is on. Use `mountAdminJsonRoute` → `adminPortsFor` → `createAdminJsonRoutePorts` at `admin-json-route-ports.ts:244,268,328,343`, with `requireAdminSession`, `sessionCredentialOnly` (the `rejectUnlessSessionCredential` rule), and `getAuthedPrincipal` at `dev-auth.ts:316,369,396`. The four writes use `requireSameOrigin`, which invokes `passesSameOriginGuard` and core `guardSameOrigin`. The paths have no workspace parameter, so bind the mounted workspace and enforce it in the live owner command gate. Resolve creator only from authenticated context. Mount the appropriate refusal even when admin assistant is off. Do not weaken the other admin assistant routes.
5. Commands take a trusted `RoutineActor`. Implement `get({actor,id})`, `list({actor})`, `create({actor,draft})`, `update({actor,id,patch},{expectedRevision})`, `setEnabled({actor,id,enabled},{expectedRevision})`, `delete({actor,id},{expectedRevision})`, `runNow({actor,id})`, and `listRuns({actor,id},{cursor,limit})`. Recheck permission in the command, stamp creator once, reschedule or unschedule only after commit, and project shared public row/summary contracts. Do not expose holder, exchange ref, credentials or context. Pause and delete stop future slots, not an already active run.
6. `GET` ready returns `{ routines, availability }`. Non-ready returns 503 with stable `details.reason` and availability. Bind Tovu’s state copy below and the plain route copy for invalid schedule, missing routine, stale revision, an active run, busy and full storage. The write-path refusals retain J2.J’s status and reason mapping.

| Availability | Reason and copy |
|---|---|
| `desktop-only` | `ROUTINES_UNAVAILABLE` — “Routines run only while the desktop app is open.” |
| `assistant-off` | `ROUTINES_ASSISTANT_OFF` — “Turn on the AI assistant to run routines.” |
| `other-window` | `ROUTINES_LEASE_HELD` — “Routines for this site are running in another Tovu window.” |
| `error` | `ROUTINES_STORE_OPEN_FAILED` — “Routines are unavailable because their data file could not be opened.” |

7. Write `<dirname(contentDbPath)>/ops/routines-beacon.json` atomically with `{v:1,enabled,updatedAt}`. `enabled` counts live enabled routines or is zero when the assistant is off. Write after commit and on boot reconciliation. Failure is diagnostic and must not undo or misreport a committed write. Keep the DB, WAL/SHM and beacon private even when content is in `data.nosync` or app-data. Verify backup, portable copy and publish selectors using the existing private-path precedents in `W/platform/site-dir/layout.ts`, `W/features/site-backup/sources.ts`, and `W/features/publish-content/backstop-policy.ts`. The desktop reader’s bound is 4 KiB.

**Tests first.** `W/server/runtime/composition/modules/__tests__/assistant-routines.integration.test.ts` covers `a routine fires with no admin tab open past the idle interval`, `assistant off → no timers`, `site withdrawal stops timers`, `request-supplied owner is ignored`, `web-only / standalone has no routines and the API says "Routines run only while the desktop app is open."`, and `close marks open runs interrupted after the drain`. Exercise the injected toggle without wiring a production producer. Cover fallback settlement, cross-origin and non-session refusal, store-open failure, no-port/static composition, passive profile, and private-file exclusions including relocated content. Mutate the desktop gate to use env presence, trust body owner, start only on admin connect, and close before drain. Use a fake starter for the no-tab test here and repeat with the real path in combine.

**Why and release.** Preserve daemon park. The beacon is a hint written after commit. Fence timers before closing the borrowed DB. Document the host contract and envelopes in the routines README. No Tovu changeset or public API baseline. Do not invent an ADR-071 citation. Stop activation if workspace ownership, private routing, or export exclusions cannot be proven.

### P3-T1b.T — Registered desktop boot, wake IPC, and sleep-safe takeover

BUILDER: OPUS

**Prerequisites and files.** Take T1a.T’s verified eligibility, sidecar, beacon and shutdown contracts. Add `D/main/boot/routine-sites.ts`, `D/main/boot/routine-wake.ts` and their tests. Change `D/main/boot/site-backend.ts`, `D/main/index.ts`, `D/tovu-server.ts`, `D/project-ipc.server.ts`, and `W/server/runtime/composition/modules/assistant-routines.ts` for the child receiver. Use `C/src/routines.ts` for the shared private message shape. Add a desktop integration test to `D/desktop-agent-service.test.ts`.

```ts
startRoutineSites({
  listSites, readBeacon, startSite, isRunning, isWithdrawn, log, policy
}, _optional = {})

relayWake({ powerMonitor, ownedRunningSites, timers, log }, { debounceMs = 2_000 } = {})
sendRoutineReconcile({ reason: 'wake' }, _optional = {})
```

1. On desktop ready, if `ROUTINES_RELEASE_ENABLED`, read `sharedSites.registry({}).list({})`. Resolve each registered candidate’s content path with the same metadata policy as the child. Read only the bounded, versioned beacon beside it. Do not guess `<siteDir>/content.db`, scan unregistered folders or open a content DB. For `enabled > 0`, use the no-window `openSiteServer({ siteDir, ctx }, {})` at `site-backend.ts:176` with concurrency two. Skip running or session-withdrawn sites. Log unreadable beacons and startup failures without dialogs. In `project-ipc.server.ts`’s `handleStop`, record withdrawal before queuing asynchronous stop and recheck inside the serialized background start. Explicit owner starts remain allowed. Default `bootRoutineSites` to `'registered-enabled-except-withdrawn'`.
2. Subscribe to Electron `powerMonitor`’s `resume` in main only, in the `bootDesktop` ready lifecycle. Debounce for two seconds and send at most one wake per running owned site. Add the method to the owned handle in `D/tovu-server.ts:772,853–870` using the existing child `ipc` channel at `:760`. Attached/non-IPC handles never send. Install the child listener only for verified desktop-eligible serving boot and accept exactly `{ type:'routines.reconcile', reason:'wake' }` from the parent channel. Route it to `reconcile({ reason:'wake' }, {})` and remove listeners and timer handles on teardown. No HTTP endpoint, renderer bridge, or daemon idle hold. Late timer classification remains the catch-up fallback.
3. Before a passive peer can interrupt another holder’s run, prove sleep-safe ownership using a monotonic-clock check or a fenced renew-on-wake check. The two-second debounce is not a lease fence. Verify behavior when the passive callback wins the first wake turn and preserve recovery when the old owner actually died. Keep any generic lease support in Jini behind injected ports.

**Tests first.** `boot starts sites with enabled routines only`, `withdrawn site stays stopped this session`, and `resume relays one reconcile`. Cover the serialized-start race, concurrency two, relocated content, malformed/oversize beacon, attached process, and listener teardown. Add the Opus lease test `sleep past the 90 s TTL does not let a waking passive peer interrupt the owner's live run`. Advance wall time past the TTL, wake the passive peer first, and assert no foreign interruption, chat cancellation, or second launch. Then prove takeover for a dead owner. Mutate withdrawal, ownership filtering, and the sleep-safe check.

**Why and release.** The registered inventory limits background work. The beacon is not authority. Private wake IPC is an accelerator, not a consent or ownership signal. No Tovu changeset or public API baseline.

### P3-T3.J — Authoritative surface approval receipts

BUILDER: OPUS

**Files and handoff.** Build with T3.T as one reviewed integration. Change `J/core/src/surface-exchanges.ts` and `J/daemon/src/surface-exchanges.ts`, with focused receipt/lease tests. Widen the optional `open` type at `J/core/src/surface-exchanges.ts:156`, currently `Record<string, never>`. Keep implementation outside Core’s contracts tree and use the existing surface/run transport.

```ts
type ApprovalReceipt =
  | { exchangeId: string; kind: 'open' }
  | { exchangeId: string; kind: 'answered'; confirmed: boolean }
  | { exchangeId: string; kind: 'ended'; reason: 'expired' | 'abandoned' }

open({ binding, emit }, { onApprovalReceipt } = {})
```

The optional callback receives `{ receipt, runId, principalId }` from the authoritative exchange. Invoke it **synchronously inside try/catch, never await it, and ignore its return value**. No raw answers, prompts, or uncorrelated results. Inject it only for confirmation exchanges. Emit at these points:

- `open` after the first leased emission, in the `send` path at `J/daemon/src/surface-exchanges.ts:187–194`.
- `answered` in the accepted-delivery path at `:219–228`, before any waiter resolves. Use `classifyConfirmationAnswer`. An accepted same-principal answer yields one receipt. Wrong binding, duplicate delivery and untracked tools emit none.
- `ended` in `end()` at `:145–155`, for expired or abandoned only.

Keep the order even for a fast answer to the first emission, without moving the consent delivery path into the observer. An affirmative receipt is earlier than the approver/grant rechecks in Tovu `human-confirm.ts:97–100`. It reports what the owner said, not what the effect did. Preserve abort, delivery, FIFO and no-TTL behavior. Any transport extension must be a discriminated server-authored payload on the existing emitter, never an argument supplied by a browser redemption request.

**Tests first.** Pin ordered receipts, wrong-principal silence, exactly one answer, abort/expiry, and `observer that throws changes neither the answer nor the effect count`. Mutate the run-bound lease and answer correlation. The paired Tovu test proves `observer never invokes the tool or delivers an answer`.

**Why and release.** A receipt cannot authorize or repeat an effect. Use the existing Core surface contract and daemon `./surface-exchanges` with no new subpath. Add core and daemon minor changesets and API baselines. This work does not fix Codex’s outer deadline.

### P3-T3.T — Observe federated approval without redeeming it

BUILDER: OPUS

**Prerequisites and files.** Build against T2.T’s owner-chat acceptance and T3.J’s receipt contract. Add `W/features/routines/{routine-approval-observer,classify-routine-approval}.ts` and `__tests__/routine-approval.integration.test.ts`. Change `W/contracts/core/human-confirm.ts`, `W/server/runtime/composition/modules/{assistant-routines,assistant-run-acceptance}.ts`, and only the existing transport bindings required by the receipt path selected below. Anchor the federated path at `agent-daemon-scope-tools.ts:19–34`, `agent-daemon-site-tools.ts:35–59,112–122`, `modules/assistant-tool-exec.ts:91–101,216`, and Jini `http/tool-execution-stream.ts:26–44` and `remote-tool-executor.ts:181–202`. Keep `modules/assistant.ts:509` and the daemon surface callback as answer authority.

```ts
createRoutineApprovalObserver({ persistence, now, readRunEvents, policy }, _optional = {})
observe({ runId, messageId, principalId, workspaceId, events, cursor }, _optional = {})
classifyApprovalEvent({ event, expectedRun }, _optional = {})
```

**Transport decision for Opus.** Choose and document one of two implementations in the paired commit:

- **Design event-stream relay.** Human-confirm injects the T3.J callback at its exchange `open`. Relay typed server-authored receipts through the existing federated emitter and durable accepted-run events. Have the T2.T settlement watcher pass them from its existing read to the observer, in order. Advance the cursor only after processing. On read errors keep state and retry the read, never the effect.
- **In-process projection.** Human-confirm injects the same receipt callback and enqueues observation into the serving site’s in-process store path, using the trusted `ctx` binding and `assistant_message_id` to locate the run before `setApproval`. Keep the T3.J invocation synchronous and non-awaiting. Handle persistence failures on the observer side. Do not add a redemption endpoint or depend on an open browser tab.

Either path must bind the receipt to the verified site/workspace, current principal, accepted message and attempt, and exchange ID. Generic user-message receipt text or an unrelated tool result never qualifies. `open(E)` sets waiting/ref/since. `answered(E)` projects approved or declined with `expectedRef:E`. `ended(E)` expires the matching ref only. Duplicates are idempotent, a terminal row wins, and any waiting approval expires on run settlement or interruption. Do not store raw answers. `approved` means **“owner said yes”**. It is not an effect result.

Keep the leased exchange bound to the live invocation, including the federated run’s abort signal. On a trusted routine run, a closed or abandoned invocation must not restore, retry, or execute after a late answer. Bind the refusal at the existing run-lifetime/restore seam using trusted routine context. Preserve normal nonroutine restoration and all current identity, approver and grant checks. The observer never opens a tab, answers the card, calls the tool, or infers consent.

**Tests first.** `observer never invokes the tool or delivers an answer`, `with zero tabs the run waits and shows waitingForApproval`, `opening the conversation and approving runs the effect exactly once`, `decline leaves data unchanged`, `another owner cannot answer`, `an unrelated tool result does not clear waiting`, and `quit → interrupted`. Add closed-invocation late-answer refusal, duplicate receipts, overlapping exchanges, and an owner revocation after the affirmative receipt but before the effect. Mutate the lease, clear waiting on every tool result, and route a receipt through an answer or effect path.

**Why and release.** Waiting is projection state. The lease is run-bound, not tab-bound. No Tovu export or changeset. Verify P8-T9/A303 with the supported adapters. Leave Codex disabled for routines while its separate 400-second deadline in `J/daemon/src/agent-executor/codex/home-config.ts:48,71,85` can beat a live exchange. Do not enable any CLI with the same problem or substitute browser receipts if the trusted path fails.

## Combined release gate

Keep `ROUTINES_RELEASE_ENABLED` off until the Jini pin and metadata checks, durable lease/takeover tests, sticky-terminal and retention tests, stale-approval tests, and marker-stripping and owner-binding tests pass. Confirm Chrome create from admin and chat, decline, edit/pause/resume/delete, keyboard, locale, timezone, light/dark and the authorized conversation link. In packaged Electron, confirm daemon restart from idle without a tab, one labeled catch-up after multiple due slots during sleep, one catch-up after reopening to Sites Home without opening the site, two-profile ownership including sleep past lease TTL, and a zero-tab leased approval followed by exactly one authorized effect. Repeat with every enabled CLI, including agy if exposed. Quit with approval pending must leave **Interrupted**, expire the approval, preserve the next slot and never replay the run.

No files changed and no tests, builds, installs, type-checks, or generators ran in this revision dispatch.
