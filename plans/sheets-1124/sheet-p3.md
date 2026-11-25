SHEETS r62t-sheet-p3 PARTIAL: 10 sheets (5 Jini / 5 Tovu), 5 moved anchors moved, 0 gone

### Merge-21 anchor table

Tovu `caa3ac7811` and Jini `dc2349f51` both matched `origin/integ/merge-21-2026-11-24`. `W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`, `D/` = Tovu `apps/desktop/src/`, `J/` = Jini `packages/`, `C/` = Tovu `packages/contracts/`. Line numbers are merge-21. **MOVED** counts named symbols or behaviors that changed files/packages, not line drift. **NEW** means the design proposed a seam that does not yet exist.

| Step | Design anchor | Merge-21 location and consequence |
|---|---|---|
| J1 | Routine types and ports | `J/daemon/src/routines/types.ts:9,15,31,47,62,88,95,118`. Keep legacy shapes usable. Add a stricter durable variant rather than making every old fixture or adapter supply database fields. |
| J1 | Scheduler, timer, claim, prepared IDs, start fence | `J/daemon/src/routines/scheduler.ts:92,94,114,126,154,168,237,255,353`. `inflight` still deduplicates start, not the whole run. `J/daemon/src/scheduler.ts:2,8` is the timer port and implementation. |
| J1/J2 | Store and schedule | `J/daemon/src/routines/routine-store.ts:32,44,60,70,145`; `J/daemon/src/routines/schedule.ts:251,278,315`. Keep current comments and legacy store behavior. |
| J2 | Seven routine routes, legacy route pack | `J/daemon/src/http/routines.ts:89,91,283,294,308,317,334,354,382,401`; exports `J/daemon/src/http/index.ts:124–132`. `J/server/src/builtin-features.ts:632` still uses the legacy pack. Do not break that mount to add the new admin mount. |
| J2 | Borrowed SQLite, route errors, API metadata | `J/core/src/contracts/storage/sqlite.ts:65`; `J/daemon/src/store/event-log/sqlite.ts:47–59`, `sqlite-policy.ts:26,145`; `J/daemon/package.json:19,85`; `J/core/src/contracts/server/json-route.ts:18,109–126`; `J/core/src/contracts/server/api-error.ts:11,30–61`; `scripts/check-api-surface.ts:18` in Jini. Use `details.reason`, not an invented top-level property. |
| T1 | Site-daemon scope, standalone branch, park | `W/server/inbound/assistant/agent-daemon-scope.ts:124,187–188,239`; `agent-daemon-server.ts:28,197,211,254`; `agent-daemon-idle-park.ts:33`; `agent-daemon-run-start.ts:118,167,185–188`. The daemon already holds activity for a live run. Existing park-refusal recovery is bound at `W/server/runtime/lifecycle/daemon-demand-fetch.ts:5–13` and `daemon-supervisor.ts:749,768`. No routine idle hold belongs in the daemon. |
| T1 | Verified desktop ownership | `W/server/runtime/boot/local-owner-signin.ts:17–31,49–55,62,106–118`; `D/tovu-server.ts:499–500`. The old design’s `desktopLaunch && desktop` is insufficient by itself. The existing accepted policy also checks parent, deployment, listener, and origin. |
| T1 | Serving app, admin mount, errors, close | `W/index.ts:321–329`; `W/server/runtime/composition/serving-app.ts:80–86`, `app.ts:419,446`, `http-app/mount-assistant.ts:21,36–39,52–65`; `W/server/inbound/admin-http/admin-json-route-ports.ts:268,343`, `dev-auth.ts:316`; `W/server/inbound/shared/admin-failure.ts:71,127`; `W/server/runtime/composition/deps.ts:74,88` exposes close and pre-close hooks. |
| T1 | Assistant switch | `W/server/runtime/composition/admin-assistant-enabled.ts:25–29`, `http-app/mount-assistant.ts:41–55`. This is a boot setting on merge-21. The mounted settings module controls the **public** assistant. There is no verified live admin-assistant toggle producer for the proposed `onAssistantToggle` port. |
| T1 | Sidecar, path, export boundaries | `W/server/runtime/composition/site-deps/database-journal.ts:23–33`, `site-paths.ts:158–165,313–328`; `W/platform/db/kernel/drivers/sqlite.ts:28`; private-tree precedents `W/platform/site-dir/layout.ts:130–148`, `W/features/site-backup/sources.ts:34`, `W/features/publish-content/backstop-policy.ts:30`. ADR-066 pin pattern `W/platform/db/migrations/index.ts:58,64,76–78` and `checksums.ts:2`. These are precedents, not places to append a routines migration to `content.db`. |
| T1 | Desktop boot, registry, withdrawal, IPC | `D/desktop-agent-service.ts:235,356`; `D/main/boot/site-backend.ts:100,148,175–182`; `D/main/index.ts:331,387,562,958,1055,1082`; `D/shared-sites.ts:13,121,164–175`; `D/project-ipc.catalog.ts:23`, `project-ipc.server.ts:165,184,195`; `D/tovu-server.ts:760,772,831–846,866`. `openSiteServer` is the no-window path that registers the handle. The child IPC transport exists. The routine message and `powerMonitor` binding are **NEW**. |
| T2 | Durable owner-chat acceptance and launch | `W/server/runtime/composition/modules/assistant.ts:90,163,172–196`; `W/assistant/durable-runs/accept.ts:5–6`; `J/chat/src/server/durable-runs/accept.ts:15–33`; `W/server/runtime/composition/modules/run-daemon-http-client.ts:75–88,129–143`. Model belongs in the **context envelope**, not a new top-level `AcceptedRunRequest` field. |
| T2 | Caller IDs, recovery, inventory, run context | `W/server/runtime/composition/modules/assistant-chats.ts:100–106,109–139,152–164,302–304,316`; `J/chat/src/store/ports.ts:90–98,112–125`; `J/chat/src/core/durable-runs/ports.ts:39–52`, `ledger-contracts.ts:17–21`; `W/assistant/agents.ts:105,119,237`; `W/assistant/run-start-context.ts:121,137–160`; `W/server/inbound/assistant/agent-daemon-run-start.ts:199–238,344–347`. Supplied conversation IDs work. The daemon decoder also **requires** `prompt`, omitted from the design’s example envelope. Existing interactive agent-alternative logic needs a strict routine branch. |
| T3 | Human card, lease, and Codex deadline | `W/contracts/core/human-confirm.ts:72–96,116–117`; `J/core/src/surface-exchanges.ts:19,84`; `J/daemon/src/surface-exchanges.ts:104–107,125–129,145–170,426`; `J/daemon/src/tool-recovery/surface-lifetime.ts:11–40`; `J/daemon/src/agent-executor/codex/home-config.ts:48,71,85`. **MOVED 1** `AssistantSurfaceDeps` → `J/core/src/contracts/site/daemon-surface-exchanges.ts:13`. The 400-second deadline still exists. |
| T3/T4 | Federated execution and callback authority | `W/server/inbound/assistant/agent-daemon-scope-tools.ts:19–34`; `agent-daemon-site-tools.ts:35–59,112–122`; `W/server/runtime/composition/modules/assistant-tool-exec.ts:91–101,216`; `assistant-byok.ts:536–551,582`; `W/assistant/byok-tool-surface.ts:718,842`; `W/server/runtime/composition/modules/assistant.ts:509`; `J/daemon/src/http/tool-execution-stream.ts:26–44`; `J/daemon/src/remote-tool-executor.ts:181–202`; `J/chat/src/core/accepted-input.ts:98,116–127`. Merge-21 already federates site tool bodies. Browser receipts are not a complete authoritative approval-outcome feed. The correlated lifecycle receipt is **NEW**. |
| T4 | Metadata and first-party catalog | `W/assistant/tool-registrations.ts:499,530–531`; `W/contracts/core/tool-metadata/index.ts:40,83,91`; `W/server/runtime/composition/tool-catalog-manifest.ts:378`; `W/contracts/core/approval-i18n.ts` still used at `human-confirm.ts:26`. **MOVED 2** `ToolApprovalPolicy` → `J/core/src/contracts/site/tool-metadata-approval-policy.ts:12`. **MOVED 3** prior publish-content example → `J/cms/src/publish/content/tool-metadata.ts:48,58`. Routine-specific descriptions and card copy remain Tovu-owned. |
| T5 | Panel, kit, picker, selection | `A/panels.tsx:191–193,1313`, `A/App.tsx:231–245`, `A/App.chrome.tsx:124`, `A/main.tsx:97`, `A/integrations/jini-kits.ts:42`; `J/admin/src/react/kit.tsx:226,588,593`, `react/index.ts:64,79`; `J/ui/src/features/schedule-picker/index.ts:25,39`, `J/ui/src/index.ts:70`. **MOVED 4** controller `select` type → `J/admin/src/shell/hooks/use-assistant-chats.hooks.ts:33`, also `J/admin/src/react/kit-chat-types.ts:169`. **MOVED 5** stable select forwarding → Jini shell hook `:105`. Tovu retains `A/hooks/use-assistant-chats.hooks.ts:24–36` and dock injection seam `A/components/AssistantDock/hooks/dock-chrome.hooks.ts:55–57`. `select` returns `void`, not an authorization verdict. |

### Build order and common rules

Build the Jini commits in the order below. Hand all five to Tovu as one reviewed artifact. Then build T1 → T2 → T3 → T4 → T5. T4’s implementation can follow T1 independently, but its contribution must stay dark until the T3 integration is checked. T5 also stays dark until the combined Chrome/Electron checks. Existing daemon park recovery is the P8-T5 prerequisite. Keep its no-admin-tab integration proof in T1.

Each sheet is one commit. Write the named tests first. The Sol run writes tests and records the named mutations for Opus, but does not run tests, builds, installs, type checks, or generators. The final integration pass owns generated baselines, catalog snapshots, admin-screen assets, and lockfile refreshes. For new public functions use `(required, _optional = {})`, and for actual optional controls use a named second object with `= {}`. In JSX, pass collaborators as required props. No re-export shells, new inter-package implementation imports in Jini, or modifications to themes. Apply the 80-line/complexity-10 caps. Keep the existing scheduler path under the WHAT’s tighter 50-line cap when touching it.

## Jini sheets

### P3-J1.J · Durable scheduler · OPUS-CHECK on claim and lease fencing

**Files.** Change `J/daemon/src/routines/{types,scheduler,index}.ts`. Add `durable-scheduler.ts` and `__tests__/scheduler.durable.test.ts` there. Leave old tests in place.

**Contracts and injection.**

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
start({}, { reason = 'start' } = {})
reconcile({ reason }, _optional = {})
rescheduleOne({ routineId }, _optional = {})
setRunHandler({ handler }, _optional = {})
stop({}, { releaseLease = true } = {})
```

Keep synchronous legacy `start`/`stop` behavior and choosing the old strategy by default when `claimDueSlot` is absent. Durable `start` returns initialization work the host can await. The new durable option `policy` has `activeSlotVisibility: 'diagnostic-only'` and `catchUpOnAssistantEnable: false` as defaults. Host injects clock/IDs, `SchedulerPort`, boot ID, diagnostics, and `onInterrupted({ runs }, {}) → Promise<void>`. Defaults for time are 60,000 ms grace, 300,000 ms maximum arm, 90,000 ms lease. Preserve timer fallback and cancel semantics.

Add `interrupted` to status. For legacy compatibility make additive row fields optional on the existing types, with required normalized fields in `DurableRoutine` and `DurableRoutineRun`. Routine fields are `revision`, `creatorId`, `model`. Run fields are `catchUp`, `slotAt`, `holderId`, `approvalState`, `approvalRef`, `approvalSince`, and `assistantMessageId` for the claim-to-accept crash window. The handler gets `{ routine, trigger, startedAt, runId, catchUp, slotAt }`. Its returned start handle can supply `assistantMessageId` before claim and accepted-attempt identity after start. Do not make the old handler or completion API depend on a database.

`RoutineDurablePersistence` extends the sync port. Add `claimDueSlot({ routineId, expectedNextRunAt, nextRunAt, run, holderId, now }, {})`, `setNextRunAt({ routineId, expected, nextRunAt, holderId, now }, {})`, `listInFlight({ excludeHolderId? }, {})`, `markInterrupted({ runIds, now, holderId }, {})`, `acquireLease({ holderId, now, ttlMs }, {})`, `releaseLease({ holderId }, {})`. Require an atomic holder check for durable manual insertion too. Use distinct active and lease-lost results. `RoutineActiveError` maps to conflict in J2. Add durable lease-state and active-drain reads for T1, e.g. `leaseState({}, {})` and `drainActive({}, { timeoutMs })`, using the injected clock/timers.

**Build.**

1. Split `classifySlot`, `applySlotDecision`, `arm`, `onTimer`, `fireSlot`, `rearmFromStore`, `reconcileInFlight`, and claim strategy. Startup acquires lease or becomes passive and retries after the TTL. On ownership, mark stale in-flight rows, await the hook, and only then allow scheduling. Heartbeat at TTL/3. On loss, fence new work and log `ROUTINES_LEASE_LOST`. Passive retries keep the originating `start`/`enable` reason.
2. A persisted future slot is armed as-is. Seed null with CAS. Past by up to the grace is ordinary, past the grace is one catch-up, except `enable` advances without firing under the default. Re-arm around clock jumps with `clamp(slotAt-now, 1_000, maxArmMs)`. Compute advance from `max(now, slotAt+1)`. Generation checks go both at timer callback and immediately before a claim after any awaited handler work. A losing CAS reloads rather than recomputes. If the row is gone, cancel its cached timer.
3. The handler only mints IDs and closures. For scheduled starts let the DB consume a due slot even when an earlier run is active. A winner sets the active map, then prepares, persists IDs, wires completion, and starts. A loser calls `discardUnstarted` exactly once, with no prepare/start. Manual active attempt returns conflict, including after a database race. Delete the active entry only after terminal persistence, and only if its run ID still matches. Prep/start errors settle the winning row, never the next slot.
4. Retry the same slot on `ScheduledRunPersistenceError` at 1, 2, 4, 8, 16 seconds while still owner and generation-current. At exhaustion log `ROUTINE_SLOT_PERSIST_FAILED` and use a bounded store reread/re-arm, not immediate recursion into the same exhausted slot. `stop` invalidates generations and clears timers and retry handles. Support quiescing without releasing the lease during an active drain so a second window cannot mark a still-live run interrupted.

**Tests first.** `restart after three missed slots fires once with catchUp and schedules the next future slot`; `wake reconcile fires once; a second wake does not`; `20 ms late timer is not catch-up`; `paused routine's old timer does nothing`; `lost claim reloads and does not run`; `claim loser creates no conversation`; `pending run across the next slot consumes it without a second run`; `clock set back one hour re-arms and does not refire the same slot`; `late timer and wake reconcile race produce one run`; `crash after claim records Interrupted and keeps the next slot`; `re-enabling the assistant skips overdue slots without running`. Preserve `scheduler.test.ts` and `scheduler.f1.test.ts`. Mutations are ignore stored slot at boot, use any positive lateness, drop generation check, prepare before claim, remove active-slot advance, or skip boot interruption. Also assert loss after the handler yields cannot claim.

**Why-comments and release.** Durable slot is truth, timers are cache. The claim precedes chat effects. Active applies through settlement, not launch. Lease and generation fence different races. Existing daemon root export, no new subpath. Daemon minor changeset calls out exhaustive consumers of `RoutineRunStatus`. Refresh daemon API baseline at combine.

### P3-J2.J · SQLite, migration, route contracts · OPUS-CHECK

**Files.** Add `J/daemon/src/routines/routine-store.sqlite.ts`, `routine-store.sqlite-schema.ts`, `migrations/{0001_jini_routines_v1,checksums,journal}.ts`, `__tests__/routine-store.sqlite.test.ts`, and a pin test. Change `routine-store.ts`, `J/daemon/src/http/{routines,index}.ts`, its `__tests__/routines.test.ts`, daemon manifest, and `J/core/src/contracts/server/api-error.ts` for the explicitly mapped 507 code. Add `J/core/src/contracts/site/routines.ts` and its universal entry for cross-package structural types such as `RoutineSchedule`, `RoutineRow`, `RoutineRunSummary`, and `RoutineAvailability`. Move the existing schedule type to that seam without changing its shape. Use the daemon’s existing public export path for compatibility.

```ts
createSqliteRoutineStore(
  { db, scope },
  { now, newId, holderId, schemaSetup = 'ensure', historyLimit = 100 } = {}
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

`creatorId` is mandatory on the durable path and is supplied by trusted composition, never parsed from request JSON. Preserve optional legacy fields and behavior where appropriate. The sync persistence and async CRUD adapters use the same borrowed handle/prepared statements. Host injects clock, IDs, and holder, owns pragmas and close. The adapter imports neither a SQLite driver nor the Jini DB runtime.

**Migration and retention.** Use one ordered, immutable **TypeScript** step `0001_jini_routines_v1`, logical name `jini-routines-v1`, with a pinned SHA-256 of the final migration source bytes and a pin test. Routines have an independent ledger `jini_routine_schema` with migration ID/name, checksum and `applied_at`, not `PRAGMA user_version` or either Drizzle journal. Put `when: 1` in the new routines journal against the empty baseline `0`. Subsequent entries are previous `when + 1`, not wall-clock time. In `ensure`, check the pinned history and run DDL plus ledger insert in a single immediate transaction. In `host`, verify the same stamp first and refuse missing, divergent, or unsupported future schema. Export `SQLITE_ROUTINES_SCHEMA` and the migration descriptor or verified runner from the node entry. Retain one DDL source. Rollback is disable and retain the sidecar, not destructive down-migration.

Create the design’s three tables and indexes. `jini_routines` has composite `(scope,id)`, validated name/prompt, schedule and target JSON, skill/agent/model/context, immutable `creator_id`, enabled, next slot, revision, timestamps, tombstone. `jini_routine_runs` has composite key/FK, trigger/status, catch-up/slot/holder, project/conversation/attempt IDs, **assistant message ID**, actual agent/model, completion/summary/error, approval state/ref/since. `jini_routine_leases` has scope key, holder and expiry. Index live `(scope,created_at,id)`, unique non-null scheduled slot, unique active per routine, and history `(scope,routine_id,started_at DESC,id DESC)`. Explicit scope on **every** statement. Soft delete disables and clears next slot without removing history links. Protect active rows from prune, retain newest 100 runs per routine, cap list at 200 live routines and history page at 50. Keyset cursor is base64url `{s,i}`, strictly validate it.

**Transactional invariants.** Each write is immediate. Claim validates current lease, scope, live/enabled state and expected slot, advances CAS and inserts the run in the same transaction. If a run is already active, commit just the advance with `active-run`. A duplicate-slot constraint rolls back the advance. Do not swallow another constraint as a lost slot. `setNextRunAt` is nullable CAS. Manual insertion requires live row, valid holder, and no active row, but is enabled-agnostic as designed. CRUD increments revision, catch-up advancement does not. Schedule/pause/resume changes re-seed or clear the slot. Revision is checked in the same transaction as PATCH/delete. Apply status changes only to active rows, expire an outstanding approval on terminal settlement, and never let a late completion overwrite `interrupted`. Approval update matches both scope/run and current exchange ref. A new `waiting` ref can replace the old one, but an old answer cannot clear the new one. Acquire/renew only if same holder or expired. Mark foreign rows interrupted only after lease acquisition establishes the old holder is no longer valid; explicit shutdown interruption can target current-holder rows.

**K1 routes.** Keep the current `routineRoutes({ deps, host }, {})` pack for existing callers, adapting it to the new narrow specs. Export named specs or `createRoutine*Route({ path, copy }, {})` factories on existing `./http`. Each uses only the command(s) it needs, availability, and for create a trusted `resolveCreator({ context }, {})`. Supply parsed path/body/query and authenticated context separately. `RouteInputContext` alone has no session principal. Validate `model` and `agentId` as optional nullable strings, max 200 for model. Accept positive safe integer `expectedRevision` in PATCH and `?revision=` on DELETE. Do not parse owner fields. Let Tovu inject target defaults and product copy. Prefer persisted `nextRunAt` when no timer is armed. Jini returns a neutral envelope and stable `details.reason`.

| HTTP | Core code | Reason |
|---|---|---|
| 400 | `BAD_REQUEST` | `INVALID_SCHEDULE`, `ROUTINES_LIMIT` |
| 401 | `UNAUTHORIZED` | No trusted creator |
| 404 | `NOT_FOUND` | `ROUTINE_NOT_FOUND` |
| 409 | `CONFLICT` | `ROUTINE_CHANGED`, `ROUTINE_RUN_ACTIVE` |
| 503 | `SERVICE_UNAVAILABLE` | `ROUTINES_UNAVAILABLE`, `ROUTINES_BUSY` |
| 507 | `INSUFFICIENT_STORAGE` | `ROUTINES_DISK_FULL` |

Add `INSUFFICIENT_STORAGE: 507` to the core status map and test it. Do not use unmapped `UNAVAILABLE`/`VALIDATION_ERROR` in core spec results. Inject Tovu text in T1. Unknown errors use the existing redacted host reporter.

**Tests first.** `reopen keeps routines and nextRunAt`; `claim and advance roll back together`; `duplicate claim loses`; `scope isolation`; `pause clears nextRunAt, resume sets the next future slot`; `delete keeps run history links`; `concurrent pause versus claim`; `late completion does not overwrite interrupted`; `CRUD write is visible to the scheduler adapter`; `update cannot change creator`; `POST ignores body ownerId and uses resolveCreator`; `POST accepts optional model and agentId`. Mutations are split claim/advance transactions, trust body creator, drop `agentId`. Add pin mismatch, second-handle lease takeover, stale-holder manual insert, and scope-isolated history prune tests. Real driver in tests only.

**Why-comments and release.** Borrowed handle and separate ledger preserve the host’s database ownership. Soft delete preserves links. Claim, advancement and prune share one transaction. Add `./routines/sqlite` to daemon `jini.entries` as `node` and to `exports` with the event-log node-entry convention, pointing directly to the implementation. Core adds universal `./contracts/site/routines`. Daemon minor and Core minor changesets, daemon/core baselines. Opus checks packaging guard and migration replay, checksum rejection, scope predicates, and retention before release.

### P3-T2.J · Boot recovery admission seam · OPUS-CHECK

**Files.** `J/chat/src/core/durable-runs/{ledger-contracts,run-finalizer}.ts`, `J/chat/src/store/runtime/{run-ledger,lazy-run-ledger}.ts`, and matching durable recovery tests. Add a structural, optional admission port through the existing `reconcileInterrupted` call. No Tovu policy in Jini.

```ts
type RecoveryAdmission = (
  required: { turn: InterruptedChatTurn; head: DurableRunHead | null },
  optional?: Record<string, never>
) => Promise<'recover' | 'leave-owned'>
```

Thread it in the existing options object and apply before `recovery.recover` **and** before the ledger’s repair fallback. A skipped row is neither resumed nor canceled by generic recovery. Preserve default behavior in every caller that does not inject a port. Resolve current head by message ID, then verify the turn’s principal/workspace/conversation before passing it to an admission policy. Do not log context or prompt. Tovu injects the policy that reserves authenticated routine turns for the routine owner process. This also lets a passive desktop profile boot without recovering or canceling the active profile’s runs.

**Tests first.** Write `interrupted after quit is recorded, not re-run` at the Tovu end as specified in T2.T. In Jini add a seam test that `leave-owned` neither dispatches recovery nor invokes fallback, then let normal interrupted chat exercise the existing path. Mutation is call recovery before admission.

**Why-comment and release.** A host can own the lifecycle of a distinct class of durable runs, and ordinary boot recovery must not race it. No new subpath, additive chat minor changeset and chat API baseline.

### P3-T3.J · Authoritative approval lifecycle receipt · OPUS-CHECK

**Files.** `J/core/src/surface-exchanges.ts`, `J/daemon/src/surface-exchanges.ts`, and focused lease/projection tests. Keep executable behavior outside Core’s contracts tree. Use the existing surface/run transport, not a new callback endpoint.

```ts
type ApprovalReceipt =
  | { exchangeId: string; kind: 'open' }
  | { exchangeId: string; kind: 'answered'; confirmed: boolean }
  | { exchangeId: string; kind: 'ended'; reason: 'expired' | 'abandoned' }

open({ binding, emit }, { onApprovalReceipt } = {})
```

The optional observer gets `{ receipt, runId, principalId }` from the existing authoritative exchange state. No raw form params, prompts, or arbitrary tool results in this receipt. Inject it only for confirmation calls. Emit open only for the emitted leased card, answer only for an accepted same-principal delivery and via the existing `classifyConfirmationAnswer` semantics, and end on expiry/abandon. Rejected callbacks, duplicate deliveries, and untracked tools cannot create a confirmed receipt. Notify before resolving the waiter where the accepted exchange carries the decision. Observation failures must not convert anything into consent or call the effect again. Preserve abort, delivery, and no-TTL rules. Keep any transport extension as a discriminated, server-authored payload on the existing emitter, not a client redemption argument.

**Tests first.** Tovu end uses `with zero tabs the run waits and shows waitingForApproval`, `opening the conversation and approving runs the effect exactly once`, `an unrelated tool result does not clear waiting`, and `another owner cannot answer`. In Jini prove ordered receipt, wrong-principal silence, exactly one answer, abort/expiry, and no effect replay by an observer. Mutations are drop run-bound lease and accept an uncorrelated answer.

**Why-comments and release.** Browser/projection receipts cannot prove consent, and an approval receipt cannot itself authorize an effect. Existing Core surface contract and daemon `./surface-exchanges`; no new subpaths. Core and daemon minor changesets and API baselines. This commit does **not** claim to fix Codex’s outer deadline.

### P3-T5.J · Routines domain React screen

**Files.** Add `J/daemon/src/react/routines/{Routines,RoutineForm,Routines.hooks,types,project-routine-row}.tsx` or `.ts` as appropriate, and `__tests__/Routines.test.tsx`. Put the browser entry on the actual `Routines` implementation module, not a second forwarding package. Domain screens do not go in `@jini-ai/admin`.

```ts
Routines({
  useRoutinesController, useSchedulePicker, useConversationDeepLink,
  kit, locale, theme, t, visible
}, _optional = {})
RoutineForm({ row, onSave, onCancel, useSchedulePicker, kit, locale, t }, _optional = {})
useRoutinesController({ api, visible, focus, timers }, _optional = {})
projectRoutineRow({ row, locale, t }, _optional = {})
```

`kit` is the host-bound structural slice with DataTable, RowMenu, ConfirmDialog and picker rendering. All custom hooks are required, including the deep-link builder used to produce a link without selecting anything from this screen. Hook contracts take two args. `api` has `list`, `create({ draft })`, `update({ id, patch }, { expectedRevision })`, `delete({ id }, { expectedRevision })`. Controller loads on show, refreshes on focus and every 30 seconds while visible, stops timers and discards stale fetch replies on hide/unmount. Table covers name, schedule and zone, pause state, agent/model, next run, last run, approval/catch-up/interruption labels, and conversation link. Form uses the injected recurring schedule picker. Menu supports keyboard; delete and pause confirmations use kit. On stale writes prompt reload and reload, never auto-resubmit. Unavailable states are explicit and have no mutation actions. Use neutral message keys. Inject human text, dates, `locale`, `theme`, and `t`. No direct `fetch`, daemon node import, or UI/admin implementation imports from this entry.

**Tests first.** `shows Waiting for approval and Catch-up run labels`; `pause/resume and delete with cancel`; `hourly shows minute past the hour, daily shows its timezone`; `menu works by keyboard`. Mutation is drop the approval state in row projection. Inject fake API/clock/kit and use host integration for actual keyboard behavior.

**Why-comments and release.** Poll only a visible panel. A conversation link navigates to an existing record and never initiates a run. Add `./routines/react` browser entry and matching export to daemon. Keep React a browser-entry peer using the domain React precedent, with no dependency added to admin. Daemon minor changeset and daemon baseline. **STOP this entry if the metadata/build guard cannot isolate it from the Node daemon entry.** Move no screen to `@jini-ai/admin` to get around the guard.

## Tovu sheets

### P3-T1.T · Verified site host, commands, routes, desktop lifecycle · OPUS-CHECK

**Files.** Add `W/features/routines/{routine-commands,routine-host,routines-paths}.ts`, `README.md`, `W/server/runtime/composition/modules/assistant-routines.ts`, and `W/platform/db/sqlite/routines-db.ts`. Add `C/src/routines.ts` for host-specific command/session/IPC shapes, importing shared row types rather than copying or re-exporting them. Change `W/index.ts`, `server/runtime/boot/local-owner-signin.ts`, `server/runtime/composition/{serving-app,create-app-options}.ts`, `http-app/mount-assistant.ts`, and thread the pre-close registration from `deps.ts` if not already accessible at composition. Add desktop helpers beside `D/main/boot/site-backend.ts`, wiring in `D/main/index.ts`, `D/tovu-server.ts`, `D/project-ipc.server.ts`. Add explicit exclusion tests around the existing backup/publish/portable selectors.

```ts
composeAssistantRoutines({
  launch, workspaceId, contentDbPath, openSqlite, beforeStoreClose, onStoreClose,
  assistantEnabled, onAssistantToggle, runStarter, approvalObserver, mountAdminRoute,
  now, newId, timers, log, writeBeacon, policy
}, _optional = {})
createRoutineCommands({ store, service, access, onCommandCommitted, availability, target }, _optional = {})
startRoutineSites({ listSites, readBeacon, startSite, isRunning, isWithdrawn, log, policy }, _optional = {})
relayWake({ powerMonitor, ownedRunningSites, timers, log }, { debounceMs = 2_000 } = {})
```

`RoutineCommands` takes a trusted `{ principalId, workspaceId }` on externally initiated operations. `get({ actor,id })`, `list({ actor })`, `create({ actor,draft })`, `update({ actor,id,patch }, { expectedRevision })`, `setEnabled({ actor,id,enabled }, { expectedRevision })`, `delete({ actor,id }, { expectedRevision })`, `runNow({ actor,id })`, `listRuns({ actor,id }, { cursor,limit })`. Recheck owner authority in commands. Stamp creator once. Reads project `RoutineRow`/`RoutineRunSummary`; never expose internal holder, exchange ref, or credential/context fields. On committed writes, reschedule/unschedule and update beacon. A beacon failure does not undo or misreport a committed write.

**Host.**

1. At the successful end of `resolveLocalOwnerSignIn`, capture a boolean `routineDesktopEligible` only for a desktop policy that passed *all* existing checks. Thread the non-secret result from real serving boot. Never infer eligibility solely from a hex-looking env value, a client/admin request, a registry entry, or an attached server. No routines DB for noneligible or static/export composition.
2. Open `<dirname(contentDbPath)>/ops/routines.db` on its own connection with WAL, busy timeout 5,000, foreign keys. Run the J2 sidecar step before mounting a ready host. Pass stable site/workspace scope and distinct boot holder. Use `beforeStoreClose` to quiesce, drain at most two seconds, mark unresolved runs interrupted, and dispose watchers. Close the borrowed connection only afterward from `onStoreClose`. Keep lease through active drain, then release. Recover from open failure by mounting an unavailable response and reporting an admin `ERR-` ID, without bringing the site down.
3. `enable({ reason })` awaits initialization, registers timers, and writes the beacon. `disable({})` freezes new claims immediately, keeps active chats alive, and writes `enabled:0`. Release the lease when those watches drain, unless re-enabled in the meantime. When disabled at first boot do not arm. The **production live toggle binding is NOT-SHEETED**. Bind existing boot setting and exercise the injected toggle in tests. Do not wire the public assistant switch or poll env to simulate an admin toggle.
4. Mount Jini specs with Tovu’s direct admin route adapter under `/api/admin/assistant/routines`, including `/:id`, `/:id/run`, and `/:id/runs`. Apply session auth, workspace and live owner admission, existing mutation origin/CSRF policy, and plain refusals. The same in-process commands serve those routes and the T4 federation handlers. `availability` is `ready | desktop-only | assistant-off | other-window | error`. `GET` when ready returns `{ routines, availability }`. For refusal use 503 with stable `details.reason` and availability, which T5 normalizes to the corresponding state. Tovu supplies “Routines run only while the desktop app is open.”, “Turn on the AI assistant to run routines.”, “Routines for this site are running in another Tovu window.”, and “Routines are unavailable because their data file could not be opened.” Also bind the plan’s plain not-found, invalid schedule, stale revision, already-running, disk-full and busy messages. No DB/lease or caller-body identity in errors.
5. Host-only beacon beside the sidecar, `{v:1,enabled,updatedAt}`, atomic using the durable JSON pattern, max 4 KiB when read. Exclude DB, WAL/SHM, and beacon from portable copy, publish, and backup even when the content file is relocated into `data.nosync` or app-data. Main reads the registered inventory from `sharedSites.registry({}).list({})` and uses the same workspace metadata-to-content-path policy as the child. Do not guess `<siteDir>/content.db`, scan unregistered folders, or open a content DB. Use the existing no-window `openSiteServer({siteDir,ctx},{})` path, concurrency two, skip running and session-withdrawn sites, log errors without dialogs. Record withdrawal before queuing async stop and recheck inside the serialized start. Explicit user starts remain allowed.
6. Subscribe to Electron `resume` at ready in main only. Surface the owned child handle’s `sendRoutineReconcile({reason:'wake'}, {})`, using the existing spawned IPC handle, never HTTP or a renderer IPC bridge. Site listener accepts exactly `{type:'routines.reconcile',reason:'wake'}` on the parent IPC channel, only when eligibility passed. Remove listeners on teardown. One wake per running owned site after a two-second debounce. A non-IPC/attached server gets no message and late timer classification remains the fallback. No scheduler or new idle hold in `createSiteScope`.

**Tests first.** `W/server/runtime/composition/modules/__tests__/assistant-routines.integration.test.ts` has `a routine fires with no admin tab open past the idle interval`; `assistant off → no timers`; `site withdrawal stops timers`; `request-supplied owner is ignored`; `web-only / standalone has no routines and the API says "Routines run only while the desktop app is open."`; `close marks open runs interrupted after the drain`. `D/main/boot/__tests__/site-backend.routines.test.ts` has `boot starts sites with enabled routines only`; `withdrawn site stays stopped this session`. `D/desktop-agent-service.test.ts` has `resume relays one reconcile`. Mutations are weak desktop-env gate, trust body owner, require admin connection to start service, and ignore withdrawn set. Add private-file exclusion, attached process, and passive-profile tests.

**Why-comments and release.** Explain why daemon park is retained, why a beacon is a hint written after commit, and why timers fence before DB close. `@tovu/contracts/routines` uses existing wildcard export. No Tovu changeset or public API baseline. Combine updates the resolved Jini artifact and records the API envelope in the routines wiring README. ADR-066 is verified; the design’s proposed ADR-071 reference remains unverified and should not be fabricated.

### P3-T2.T · Routine runs use normal owner-chat acceptance · OPUS-CHECK

**Files.** Add `W/features/routines/routine-run-handler.ts`, `W/server/runtime/composition/modules/assistant-run-acceptance.ts`, `W/features/routines/__tests__/routine-run-handler.unit.test.ts`. Change `assistant.ts`, `assistant-chats.ts`, `assistant-routines.ts`, `W/assistant/run-start-context.ts`, `W/server/inbound/assistant/agent-daemon-run-{start,tool-access}.ts`, and `C/src/routines.ts`. Extend the existing boot-repair test.

```ts
createRoutineRunHandler({
  owners, agents, chatHistory, runStarter, updateRun, now, newId,
  localeTime, catchUpText, agentPolicy
}, _optional = {}): RoutineRunHandler

acceptOwnerChatRun({
  principalId, workspaceId, conversationId, messageId, agentId, contextRef
}, _optional = {})

watchSettlement({ principalId, workspaceId, messageId }, { cursor, onEvents, signal } = {})
cancelChatRun({ principalId, workspaceId, conversationId, messageId }, { reason } = {})
```

1. Handler derives `conversationId = "routine-" + runId`, mints user/assistant IDs, and returns the deferred, prepare/start/discard functions and claimed IDs. No external calls or writes. `discard`/`discardUnstarted` resolve canceled and dispose watch. No conversation to delete on a loss.
2. After claim, resolve the same persisted creator against the current workspace owner policy. Check explicit or eligible default local CLI agent against `listAssistantAgents`; check signed-in/available and model presence. No BYOK or Codex scheduling by default. No substitute for an unavailable explicit choice. Pin resolved choice across prepare and daemon dispatch. Bind a strict routine branch before interactive alternatives in run tool access, so a race in availability does not silently switch agent/model. Keep ordinary owner-chat alternatives unchanged. Record actual selection with the run.
3. Bind the same owner to `chatHistory({kind:'user',workspaceId,userId})`. Use supported supplied IDs. Create titled conversation, append a redacted user turn, then the same assistant stub accepted by ordinary owner-chat. Add catch-up prefix to both durable text and the guarded prompt. Include local time of the consumed slot. Check null writes and do not launch a half-prepared turn. A claim-row link can briefly resolve to no conversation before prepare. Do not turn that interval into a new conversation on link click.
4. Move the existing acceptance binding and why-comments out of the Express handler. HTTP still parses, authenticates, and returns 201/404 as before. Routine callers use that binding directly, with the **same** sanitizer, tracking, demand client and finalizer, not an executor. Context includes required `prompt`, trusted principal/conversation/assistant ID, optional `model`, and `{routine:{routineId,runId,catchUp,slotAt}}`. Strip the `routine` marker from browser inputs before rebuilding accepted context. Carry the marker only on host-created durable acceptance, validate it on decode, and compare to persisted run/user context in recovery. Start stores the actual accepted attempt ID, but recovery uses stable assistant message ID even if the attempt ID was never written. Use the same accepted message for retries, never mint another attempt manually.
5. Watch durable owner-scoped poll or head on a 1–5 s capped backoff. Verify scope and use one read per tick for settlement and T3 receipts. `completed → succeeded`, `failed → failed`, `canceled → canceled`. Normalize summary whitespace and cap at 280 chars. Report known failures in plain words, including no longer authorized, model/agent unavailable, and a definitive daemon startup refusal. Acceptance deliberately tolerates an ambiguous dispatch response, so do **not** treat request timeout after commit as proof the effect never ran or start another attempt.
6. Before `assistant-chats.ts:129` initiates ordinary repair, await the routine ownership/repair barrier. Cancel by the saved assistant message ID, using the scoped durable head and current attempt ID. Check principal/workspace/conversation before fencing. Register T2.J admission for all trusted routine-marked turns so generic recovery cannot relaunch one, including on a passive profile or when a cancellation write failed. Leave next scheduled slot intact. Keep nonroutine boot recovery working. A normal no-slot first boot and a passive boot must not block on a lease retry.

**Tests first.** `one principal throughout`; `the result links the real conversation id`; `claim loser starts nothing`; `unavailable agent or model fails with a plain reason and no substitute`; `interrupted after quit is recorded, not re-run`; `routine run uses acceptOwnerChatRun`. Mutations are skip interruption cancellation/admission or call executor directly. Exercise Claude and Codex adapter fakes through the common acceptance seam, with an explicit test-only policy override for the Codex wiring test and a separate production-default refusal. Cover a crash after chat acceptance but before attempt-ID persistence. Also test an ordinary HTTP caller cannot set the trusted routine marker.

**Why-comments and release.** Acceptance commits before launch; the message is the idempotency identity. Generic recovery never owns routine runs. Use existing chat/daemon subpaths and existing `@tovu/contracts` wildcard. No Tovu changeset/API-baseline file.

### P3-T3.T · Observe approval, never redeem it · OPUS-CHECK

**Files.** Add `W/features/routines/{routine-approval-observer,classify-routine-approval}.ts` and `__tests__/routine-approval.integration.test.ts`. Change `W/contracts/core/human-confirm.ts`, T2’s settlement watcher, `assistant-routines.ts`, and the existing daemon/federation run-event projection bindings as needed to preserve the typed receipt. Keep `assistant.ts:509` and the daemon surface callback as the answer authority.

```ts
createRoutineApprovalObserver({ persistence, now, readRunEvents, policy }, _optional = {})
observe({ runId, messageId, principalId, workspaceId, events, cursor }, _optional = {})
classifyApprovalEvent({ event, expectedRun }, _optional = {})
```

Human-confirm supplies the T3.J receipt callback to the exchange it opens. Relay over the already bound emitter to the accepted chat turn. The trusted event binding matches site, principal, durable message/current attempt, and exchange ID. Do not use generic user-message receipt text or uncorrelated tool results. The observer consumes the same read as settlement, in order, and only advances its cursor after processing. `open(E)` sets waiting/ref/since, `answered(E)` updates approved or declined only for `expectedRef:E`, and `ended(E)` expires the matching exchange. Duplicate receipts are idempotent. No stored raw answers. Terminal row wins, and unresolved waiting becomes expired on interruption or run settle. On read errors keep state and retry the read, not the effect.

For routine runs, keep a leased confirmation tied to its live invocation. A closed/abandoned invocation must not take the restoration/retry path and execute later. Bind that refusal from the trusted routine-run context at the existing run lifetime/restore seam. Never trust a browser-supplied routine flag. Preserve existing behavior outside routine calls. Do not open an admin tab, alter consent policy, or make the observer deliver answers. Scope answer verification stays at existing authorization gates. Verify the **federated** path retains the run-bound signal and existing callback delivers to the owning store, including when the user opens the chat after the card appeared.

**Tests first.** `with zero tabs the run waits and shows waitingForApproval`; `opening the conversation and approving runs the effect exactly once`; `decline leaves data unchanged`; `another owner cannot answer`; `an unrelated tool result does not clear waiting`; `quit → interrupted`. Mutations are drop the lease and clear waiting on every result. Add a closed-invocation late-answer refusal and an overlapping-exchange test.

**Why-comments and release.** Waiting is projection state, not a grant. Lease is run-bound and not browser-tab-bound. No Tovu export or changeset. **STOP enabling any CLI** whose outer deadline beats the live exchange. Codex has a known stop at `J/daemon/src/agent-executor/codex/home-config.ts:48,71,85`. The default excludes it. Opus checks supported adapters and P8-T9/A303 together. If server-authored receipts cannot traverse the accepted run intact, stop this sheet before substituting browser events.

### P3-T4.T · Assistant routine tools over existing site federation · OPUS-CHECK

**Files.** Add `W/features/routines/routine-tool-registrations.ts`, its unit test, and `W/contracts/core/tool-metadata/routines.ts`. Change `tool-metadata/index.ts`, `approval-i18n.ts`, the contribution binding at `tool-catalog-manifest.ts:378`, and site-tool composition in `tool-registrations.ts` and `assistant-byok.ts` as needed to inject the same serving-site commands and surfaces. No routine store or copied registry in the daemon.

```ts
contributeRoutineTools({
  commands, surfaces, validateSchedule, requireHumanConfirm,
  resolveOwnerActor, availability, copy
}, _optional = {})
```

Inputs `routine_list({})`, `routine_create({name,prompt,schedule,agentId?,model?})`, `routine_set_enabled({id,enabled,revision})`, `routine_delete({id,revision})`. Owner-derived actor uses authenticated execution context. List is read-only, `{class:'read',confirmation:'direct'}`. Writes use `{class:'edit',confirmation:'direct'}` and call `requireHumanConfirm` in the body. Do **not** use `'policy'` for these writes or allow remembered approvals to skip the card. Parse and validate schedule before prompting, require zone on daily/weekdays/weekly, and verify existence and revision for state/delete. Card includes Schedule, Prompt, Agent, Model, and the desktop availability note. Decline or absent channel returns “Nothing was changed.” Without trusted owner context, refuse before producing a card. After explicit confirm call the command with `expectedRevision`, checked transactionally. Use stale refusal “This routine changed since you looked. List routines again.” No retry.

Daemon uses its existing token-bound site tool RPC. The serving site runs the handlers and owns the data. Contribute to authenticated owner-specific discovery only when feature exposure and ready availability permit. Keep visitors, standalone, absent owner, and unbound calls out. Keep the contribution disabled until T3 combine, and refresh the catalog through its existing revision mechanism when rollout changes. The Tovu tool description says a routine is a recurring AI job, it runs only while Tovu desktop is open and awake, hourly times are a chosen minute past the hour, and daily/weekly schedules need a timezone. Localize `Create routine`, `Pause routine`, `Resume routine`, `Delete routine`, `Schedule`, `Prompt`, `Agent`, `Model`, and `This routine runs only while Tovu is open and your computer is awake` in all existing approval locales.

**Tests first.** `create opens the card before saving`; `decline saves nothing`; `policy cache cannot skip routine cards`; `stale row on delete is refused`; `visitors never see the tools`. Keep approval metadata completeness and catalog golden-name/bytes tests. Mutation is write before the card. Add a revision change *while* card is open and owner revocation while waiting. Combine regenerates the catalog only at exposure.

**Why-comments and release.** Direct means the handler always asks. The revision CAS protects the exact row the owner saw. The site owns the command and the daemon only transports the authorized call. No export, manifest dependency, changeset or API baseline update in Tovu.

### P3-T5.T · Admin mount, site copy, and authorized deep link · OPUS-CHECK

**Files.** Add `A/features/routines/{RoutinesMount,routines-api,routines-i18n,use-conversation-deep-link}.tsx` or `.ts`. Change `A/panels.tsx`, `A/App.tsx`/`App.chrome.tsx`, `A/components/AssistantDock/{AssistantDock,AssistantDock.state.hooks}.tsx` or `.ts` at the actual dock composition, and `A/integrations/jini-kits.ts` only for the structural kit bridge. Write panel and dock integration tests. The screen implementation is P3-T5.J, not a duplicate Tovu screen.

```ts
createRoutinesApi({ requestAdminJson, basePath }, _optional = {})
RoutinesMount({ useAdminLocaleHook, useRoutinesController, useSchedulePicker,
  useConversationDeepLink, kit, visible }, _optional = {})
useConversationDeepLink({ query, chats, lookupConversation, replaceQuery, notify }, _optional = {})
```

Bind `DataTable` and `RowMenu` from the admin React entry and `ConfirmDialog` from the host kit at the mount. Bind picker + injected picker hook from the existing UI export. Pass all custom hooks as required props. Host injects locale/theme/translator, authorized admin fetch with current session/error handling, visibility/focus, timers, and the conversation URL builder. API sends expected revisions for writes, maps known 503 reasons to the non-ready state, keeps an `ERR-` ID in toast detail, and does not report refusal as an empty ready list.

Add `/routines` beside AI Assistant through `PANELS` under the combined release flag. Extend the `ai-assistant` query allowlist to `{tab:null,conversation:null}`. Pass the current query to the **existing** dock instance through App chrome. Open the dock when applying a valid link if it is closed. Do not mount a second controller. After the authorized owner context is ready, resolve the conversation ID with the current owner-scoped chat read. Use the result, not `select`’s return value, to distinguish allowed/missing. Call `chats.select({id},{})` once for a valid query. Fence stale results when query or principal changes. On missing/inaccessible show “This conversation is no longer available.” and remove only that parameter with replace, preserving `tab`. Never create, send, or start a run. On an unrelated route carrying a `conversation` parameter, do nothing.

Bind the plan’s locale keys in all admin locales, including the schedule/result/approval labels, agent default, open conversation, desktop-only, save failure and stale delete. Active approval and catch-up labels may appear together. Use the specific other-window/off/error message rather than a generic desktop-only instruction when known. Refresh the generated admin-screen catalog and mounting assertions in combine.

**Tests first.** Preserve the screen tests from P3-T5.J. Dock tests `conversation deep link selects it without starting a run`; `deep link after reload selects the authorized conversation`; `missing or inaccessible conversation shows a notice and launches nothing`. Mutations are drop approval state in projection and link without selecting. Add an unauthorized-owner race and preserve unrelated query keys.

**Why-comments and release.** A URL selects an authorized existing conversation; it is never permission to open another owner’s data or start a run. Host consumes daemon `./routines/react` only after the browser export is verified. No Tovu changeset or API baseline.

### Owner questions decided by default

Bind each as one injected field in the existing policy/args object. Keep these out of request bodies.

| Question | Injected value | Result |
|---|---|---|
| Q1 skipped slots visible | `activeSlotVisibility: 'diagnostic-only'` | Advance and log, no phantom history row. |
| Q2 catch up when assistant is re-enabled | `catchUpOnAssistantEnable: false` | Skip overdue slots after deliberate disable. Cold reopen and wake still catch up once. |
| Q3 pause/delete cancels active run | `stopActiveOnDisableOrDelete: false` | Only future slots stop. |
| Q4 background sites at desktop boot | `bootRoutineSites: 'registered-enabled-except-withdrawn'` | No window, concurrency two, no session-withdrawn site. |
| Q5 BYOK | `allowByokRoutineAgents: false` | Local CLI only. |
| Q6 Codex before lease/deadline fix | `allowCodexRoutineAgent: false` | “Codex can't run routines yet. Choose another agent.” |
| Q7 pending approval on full quit | `approvalOnQuit: 'interrupt-and-expire'` | No reissue, replay, or inferred consent. Next slot remains scheduled. |

### STOP list

- **NOT-SHEETED — production live admin-assistant toggle.** Merge-21 has an environment-derived boot switch, not a live admin switch. T1 includes the injected lifecycle and its tests. A production live producer requires a separate verified contract. Do not bind the public assistant toggle. This is the reason for **PARTIAL**.
- **Budget stop.** Stopped repository lookups at 220. No files changed. No tests, builds, installs, type checks, or generators ran. The missing `AI-Dev-Shop` directory was expected for this dispatch. The ADR-071 pointer was not verified and is not an implementation dependency.
- **STOP before activation** if private path resolution or export exclusion fails, if authenticated ownership cannot be bound without a caller-provided ID, if chat prepare must run before the claim, if the recovery barrier cannot precede normal boot recovery, or if the browser/node export guard refuses the proposed entry. Do not ship a fallback that bypasses any of those seams.
- **Codex remains off for routines.** Do not lift that default on the strength of the exchange’s infinite idle deadline. It does not remove the separate 400-second outer deadline.
- **Opus combine gate.** Review lease takeover, sticky terminals, migration/checksum/retention, stale approval, and principal binding. Then run named red/green and mutation proofs, metadata/API guards, and generated baselines. In Chrome check admin/chat create, decline, edit/pause/delete, keyboard, locale, and light/dark. In packaged Electron verify idle daemon restart without a tab, sleep through multiple slots, reopen to Sites Home and get one catch-up without opening the site, two-profile ownership, and zero-tab leased approval followed by one authorized effect. Run with each enabled CLI, including agy if exposed. Keep the panel and tool contribution dark until those checks pass.
