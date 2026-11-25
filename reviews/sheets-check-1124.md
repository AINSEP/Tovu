DONE

# Build-sheet check, 2026-11-24: sheets for P3, P4, P5 and P11

This is a read-only review: no product code was changed.

- **Input:** Tovu `origin/plan/whats-left-1122` at `ab82b224f`, `plans/sheets-1124/sheet-{p3,p4,p5,p11}.md`.
- **Checked against:**
  - the approved designs `plans/ALGO-P{3,4,5,11}-*.md` and the WHAT plans;
  - the owner decisions in `INDEX.md`;
  - the code on `integ/merge-21-2026-11-24` (Tovu `7c87b3c3f`, Jini `010c8cd87`).

**Role:** Software Architect, design-review mode. I read `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2, 2026-11-05) first and confirm it was loaded. This run checks existing sheets; it writes no ADRs, so the ADR, outline and CIC workflow steps were out of scope. I applied the skill's boundary, contract and coding-foundations constraints to the sheets.

**Method:**
- Five read-only Opus (high) reviewers ran, at most four at once: P3, P4, P5, P11-Jini and P11-Tovu.
- Each verified anchors at the cited lines on merge-21.
- I re-checked the load-bearing claims myself before accepting them:
  - `source-digests.ts:1-6`: a new step never gets an entry;
  - `openChatDb` does not run the chat chain (`chat-db.ts:68-74`);
  - `confirmation:'always'` is absent from Tovu;
  - `tovu_migrations` appears in a Jini sheet (`sheet-p5.md:92`);
  - the golden value is `762098`;
  - `admin-failure.ts:18` reads `status?: 503`;
  - Jini `delegated-tools.ts:220` writes to the console;
  - `import-media-entity.ts:327` and `blob-put.ts:73` call `putIfAbsent`;
  - the Tovu `jini-routes.ts` file moved to `W/platform/express/`;
  - Jini `run-finalizer.ts` has no recovery loop, and the recovery loop is at `run-ledger.ts:296`;
  - the commerce TS-migration precedent exists;
  - the source commit `1b7dcff86` exists.

## Summary

| feature | sheets | APPROVE | FIX | REJECT | Codex self-status |
|---|---|---|---|---|---|
| P3 Routines | 10 | 0 | 10 | 0 | PARTIAL (live assistant toggle not sheeted; budget) |
| P4 Errors | 10 | 3 | 7 | 0 | PARTIAL (J3a/J3b HOLD, T4 already landed — deliberate) |
| P5 Import history | 8 | 1 | 7 | 0 | COMPLETE |
| P11 Storage budget | 43 | 14 (1 Jini + 13 Tovu) | 28 | 1 (ST-7a.J for Sol) | PARTIAL (G1–G6 anchors absent, correctly STOP-gated) |

**Verdict:** no feature can go to Codex Sol as-is. Each one needs the fixes below first. Every fix is written as exact replacement text, so an editor can apply them mechanically to the sheets before Sol runs.

## Cross-cutting findings (apply to more than one sheet)

1. **Migration conventions are wrong in three sheet sets.** Sol cannot compute migration pins. In every case Sol leaves the pin as a placeholder and Opus generates and verifies it.
   - **P11, Tovu:** `sheet-p11.md:34` says to add a new step to `source-digests.ts`. That file's own header says a NEW step never gets an entry there.
   - **P3 (`journal.ts`, `when: 1`) and P5 (`journal.ts`, `when`):** both invent a journal that no code reads.
   - **The rule:** ADR-066 TS histories have no `when`. The ordered step array plus the ledger is the history. The owner's "`when` = previous + 1" rule governs the frozen Drizzle journal only (ADR-066:21,53). No Drizzle entry is needed for any of these sheets.
   - **Jini precedent to copy:** `J/commerce/src/payments/ledger/migrations/index.ts`.
2. **Invented contract pieces.**
   - P11 ST-15c uses `confirmation:'always'`, which does not exist in Tovu.
   - P4 J2/J4/J5 inject `runOperation`/`startOperation`/`endOnce`/`reportInternalError` as extra ports, which are not in the design.
   - P5 T2.J creates a `tovu_migrations` table inside a Jini package, which breaks neutrality.
3. **Fresh bootstrap versus migration.** P11 ST-9.T claims `openChatDb` runs the TS chain. It does not, and ST-11b.T leaves out the `freshSiteOperations` entry. Without both fixes, fresh databases and migrated databases end up with different schemas.
4. **Base drift.** The sheets were verified at Jini `dc2349f51` and Tovu `caa3ac7811`. The `integ/merge-21` tips have since moved: Jini by 161 files. Some media and `json-route.ts` anchors are 1–13 lines off. Sol must locate functions by name, not by line.
5. **Shallow clones.** P11 ST-7a restores from Jini `1b7dcff86`, which a shallow clone cannot see. The executor must run `git fetch --unshallow` first.
6. **Decisions left to the executor.** Many sheets contain phrases like "as needed", "or add a companion", "verify X" or "STOP if it cannot". A runner that cannot test cannot make these calls. Each row below says what to put in their place.

## P3 Routines — `sheet-p3.md` (10 sheets: 5 Jini, 5 Tovu)

Sheet status: `SHEETS r62t-sheet-p3 PARTIAL`. Two things are missing:
- The production live admin-assistant toggle is NOT-SHEETED (`sheet-p3.md:312`). Merge-21 has only the boot env switch, at `W/server/runtime/composition/admin-assistant-enabled.ts:29`.
- Codex ran out of lookup budget (`:313`).

The `.J` seams added for T2, T3 and T5 (7 INDEX rows become 10 commits) are a sound split.

| sheet id | verdict | exact fix text |
|---|---|---|
| P3-J1.J | FIX | Five changes. **(1)** `:52,59`: the return type of `start` is ambiguous. Keep `start(_required = {}, { reason = 'start' } = {}): void` unchanged. Add `whenReady({}, _optional = {}): Promise<void>`. It resolves after the lease is acquired and boot interruption is done, or at once in legacy mode. **(2)** `:63`: replace "e.g. `leaseState`/`drainActive`" with exact `RoutineService` methods: `leaseState({}, {}): 'owner'\|'passive'\|'stopped'`; `quiesce({}, {}): void` (fences new claims, keeps lease and heartbeat); `drainActive({}, { timeoutMs = 2_000 } = {}): Promise<{ drained: boolean; pendingRunIds: string[] }>`. **(3)** `:49`: type `timers` as `SchedulerPort` (`J/daemon/src/scheduler.ts:2`), defaulting to `createTimeoutScheduler({}, {})`. Replace the direct `clearTimeout` at `J/daemon/src/routines/scheduler.ts:121` with the port's cancel. Throw at construction when `claimDueSlot` is present and `holderId` is missing. **(4)** `:67`: when `onInterrupted` rejects, log `ROUTINES_INTERRUPT_HOOK_FAILED` and still arm the timers. This is safe because T2's admission barrier blocks a relaunch. **(5)** `:72`: add named lease tests: `passive start arms no timers and retries after leaseTtlMs`; `heartbeat renew false stops claims and logs ROUTINES_LEASE_LOST`; `lease lost while handler awaits: claim returns lease-lost, prepare never called`; `passive process never marks the owner's in-flight runs interrupted`. Mutations: drop the holder check in `claimDueSlot`; ignore the heartbeat result. Pair each existing mutation with its test by name. |
| P3-J2.J | FIX (blocking: migration) | **Replace `:98`** with Jini's own ADR-066 precedent, `J/commerce/src/payments/ledger/migrations/index.ts:20-90` (coordinator verified). **(a)** `J/daemon/src/routines/migrations/0001_jini_routines_v1.ts` exports the factory `jiniRoutinesV1({ checksum })`, which returns a `MigrationStep` (`@jini-ai/core/contracts/storage`) with the DDL in `up(kernel)`. **(b)** `migrations/index.ts` exports `JINI_ROUTINES_LEDGER_TABLE = 'jini_routine_migrations'`, `pinnedChecksum({ id }, {})`, `JINI_ROUTINES_MIGRATIONS` and `migrateJiniRoutines({ kernel, runMigrations }, _optional = {})`; the host injects db's `runMigrations`. **(c)** The pin in `checksums.ts` is the normalized source hash (comments stripped, whitespace collapsed), not "raw source bytes". Sol leaves it as a placeholder; Opus generates it with the pin test. **(d)** Delete `journal.ts` and the `when: 1` text: ADR-066 TS histories have no journal, and the ordered step array is the history (ADR-066:21,53). See owner question 3. **(e)** Store `schemaSetup` defaults to `'host'` and refuses unless ledger row `0001_jini_routines_v1` exists with the pinned checksum. Drop `'ensure'`. **(f)** The pin test also asserts the migration source contains no `VACUUM`. Other fixes: `:96,104` state that the legacy `routineRoutes` pack (`J/server/src/builtin-features.ts:632`) passes no creator and that the in-memory store keeps `creatorId` optional. List the factories `createRoutine{List,Create,Get,Update,Delete,RunNow,Runs}Route({ path, copy }, {})`. Each returns a `defineJsonRoute` spec whose `ports.authenticate` context feeds `resolveCreator({ context }, {})`; `null` → 401 `UNAUTHORIZED`. `:93,102`: the `setApproval` SQL is `WHERE scope=? AND id=? AND status='running' AND (:expectedRef IS NULL OR approval_ref = :expectedRef)`, with the test `old exchange answer cannot clear a newer waiting ref`. Error mapping: `SQLITE_BUSY` → `ROUTINES_BUSY`, `SQLITE_FULL` → `ROUTINES_DISK_FULL`. State that pruning deletes routine run rows only, never conversations. |
| P3-T2.J | FIX | `:123` names the wrong file. `J/chat/src/core/durable-runs/run-finalizer.ts` has no recovery loop (coordinator verified). The seam is `J/chat/src/core/durable-runs/ledger-contracts.ts:18-21` (`ChatRunRecoveryOptions`) plus `J/chat/src/store/runtime/run-ledger.ts:296-310` (`reconcileInterrupted`). `lazy-run-ledger.ts:28-30` already passes options through. At `:126-129`, drop `head`. The port is `admit?: (required: { turn: InterruptedChatTurn }, optional?: Record<string, never>) => Promise<'recover'\|'leave-owned'>`. Before `optional.recover?.(...)`, add `if ((await admitSafely(turn)) === 'leave-owned') continue;`: the turn is not counted, not recovered and not cancelled. If admission throws, treat it as `leave-owned` and log it. |
| P3-T3.J | FIX | `:148`: also widen the `open` optional type at `J/core/src/surface-exchanges.ts:156` (today `Record<string, never>`). `:151`: `onApprovalReceipt` is called synchronously inside try/catch, never awaited, and its return value is ignored. Add the test `observer that throws changes neither the answer nor the effect count`. Emit sites: `open` after the first leased emission; `answered` in the accepted-delivery path before waiters resolve; `ended` in `end()` (`J/daemon/src/surface-exchanges.ts:145-155`) for expired/abandoned only. `answered confirmed:true` fires before the approver/grant rechecks (`W/contracts/core/human-confirm.ts:97-99`), so the T5 label must say "owner said yes", not "done". |
| P3-T5.J | FIX (needs the owner's OK; otherwise Opus builds it) | This departs from the design: `ALGO-P3-routines.md:539` and `P3-routines.md:53` put the screen in Tovu `A/features/routines/`. Default: **revert to the design's Tovu screen**, which Sol can build. If it stays in Jini, copy `J/commerce/package.json` at `:175`: `jini.entries["./routines/react"]: "browser"` (:20), the opt-in reason (:37), an `exports` block (:73), an optional `react` peer (:132), and devDeps `react`, `@testing-library/react` and `jsdom` (:141-145), plus a jsdom vitest environment. That puts a browser entry in a `runtime: node` package and needs a lockfile refresh, so Opus builds it. |
| P3-T1.T | FIX (Opus builds) | Seven changes. **(1)** `:198`: add `routineDesktopEligible: boolean` to `LocalOwnerSignInPolicy` (`W/server/runtime/boot/local-owner-signin.ts:9`), true only in the desktop branch (`:40`). Read `bootLocalOwnerSignIn` once in `W/index.ts` (near `:321`) and pass it into `createServingApp`. Never import the singleton (`:118`) inside `assistant-routines.ts`. **(2)** `:184-187`: bind the production fallbacks for this commit. `runStarter`: refuse and settle `failed` with "Routines are not ready yet.". `approvalObserver`: `{ observe: async () => {} }`. `onAssistantToggle`: `() => () => {}`, seeded from `isAdminAssistantEnabled(env)`. Name ONE release flag and reuse it in T4 and T5. **(3)** `:181`: replace "thread pre-close … if not already accessible" with `deps.ts:74,88` used as `database-journal.ts:23-33` uses it. **(4)** `:189,194`: give the types and defaults of `access` and `target`. **(5)** `:201`: name the exported admin adapter and CSRF/origin functions (`admin-json-route-ports.ts:268,343`; `dev-auth.ts:316`), not just line numbers. **(6)** Split into T1a (site host, routes, sidecar, beacon) and T1b (desktop boot, wake IPC). **(7)** Add the P7-J2 prerequisite from `INDEX.md:35`. |
| P3-T2.T | FIX | Three changes. **(1)** `:211`: add `W/server/runtime/composition/modules/run-finalizer/entry.ts:99,285` to Files. `reconcileInterrupted` hard-codes `{ recover }` there; thread `admit` through. **(2)** `:219-221`: the trusted marker goes in the optional object: `acceptOwnerChatRun({ principalId, workspaceId, conversationId, messageId, context }, { agentId, routine } = {})`. The function deletes any browser-supplied `context.routine` and re-adds it only from `routine`. `proxyAcceptedRun` (`modules/assistant.ts:172-196`, which spreads browser `decoded`) must never pass `routine`. Add the test `browser-supplied context.routine is stripped`. Name `assistant-run-acceptance.ts` as the home of `watchSettlement` and `cancelChatRun`. **(3)** `:232`: install the admission on every boot, keyed on the trusted durable routine marker, not on routine-DB availability. Add the test `web-only boot leaves a routine turn unrecovered` (owner rule: interrupted, never re-run). |
| P3-T3.T | FIX (Opus builds) | `:240` ("bindings as needed") and `:250` ("Verify the federated path…") leave the receipt transport (exchange → emitter → durable run events → observer) to the executor, behind a STOP at `:254`. Opus decides between the design's event-stream relay and an in-process `setApproval` keyed by `assistant_message_id` from the trusted `ctx`. Either way it stays observe-only, pinned by the test `observer never invokes the tool or delivers an answer`. |
| P3-T4.T | FIX | `:258`: replace "as needed" with the exact edits in `W/assistant/tool-registrations.ts` and `assistant-byok.ts:536-551`. `:271`: add the test `delete opens the card before deleting` (mutation: delete before the card), so deletion is pinned behind the existing approval card. Add the four tool IDs to the `requireHumanConfirm` allowlist completeness scan (`W/contracts/core/human-confirm.ts:86-88`). Name the T1 release flag. The executor must confirm that `confirmation:'direct'\|'policy'` and `class:'edit'` exist in `J/core/src/contracts/site/tool-metadata-approval-policy.ts`, and STOP if they do not. |
| P3-T5.T | FIX | Depends on the T5.J decision. `:277`: replace ".tsx or .ts" and "at the actual dock composition" with exact file names, and name the dock state hook that receives `query` (as a REQUIRED prop). Name the release flag. Under the default (revert to the design), this sheet also carries the screen files from `P3-routines.md:53`. |

**Anchors checked (all correct unless noted):**
- Jini daemon: `J/daemon/src/routines/scheduler.ts:92-353` (9 lines); `types.ts` (8 lines); `routine-store.ts` (5 lines); `J/daemon/src/scheduler.ts:2,8`; `J/daemon/src/http/routines.ts:89-401` (10 lines); `http/index.ts:124-132`.
- Jini other: `J/server/src/builtin-features.ts:632`; `J/core/src/contracts/server/api-error.ts:11,30-61`; `json-route.ts:18,109-126`; `J/core/src/contracts/storage/sqlite.ts:65`; `J/daemon/src/surface-exchanges.ts:104-107,125-129,426`; `J/core/src/surface-exchanges.ts:156`; `J/chat/src/core/durable-runs/ledger-contracts.ts:11-21`; `J/ui/src/features/schedule-picker/index.ts:25,39`.
- Tovu: `W/server/runtime/boot/local-owner-signin.ts:17-31,106-118`; `site-deps/database-journal.ts:23-33`; `admin-assistant-enabled.ts:25-29`; `modules/assistant-chats.ts:100-139`; `modules/assistant.ts:172-196`; `W/index.ts:321-329`; `D/tovu-server.ts:499-500`; `D/main/boot/site-backend.ts:100,148,175-182`; `D/shared-sites.ts:13,121,164-175`; `W/contracts/core/human-confirm.ts:72-117`; `A/panels.tsx:191-193,1313`.
- **Wrong:** `J/chat/src/core/durable-runs/run-finalizer.ts` is not the recovery seam; it is `J/chat/src/store/runtime/run-ledger.ts:296`.
- **Missing from the sheet:** `W/.../run-finalizer/entry.ts:99,285`.

**Build recommendation:** apply these fixes before Sol runs anything.
- After the fixes, Sol can execute J1, J2 (rebuilt on the commerce migration precedent), T2.J, T2.T and T4.T. Opus must review T2.T's marker-stripping and admission tests.
- Opus builds T3.J + T3.T together: the receipt transport is still an open design choice, and approval must be observed, never redeemed.
- Opus builds T1.T, split in two: desktop eligibility, IPC and drain-before-close.
- Opus builds T5.J if the screen stays in Jini; otherwise Sol builds T5.T under the design default.
- Uncovered lease risk for Opus: if the laptop sleeps longer than the 90 s lease TTL, a passive peer can win the lease on wake, mark the owner's live run interrupted and cancel it. Add a test with a monotonic-clock or renew-on-wake check before the passive peer may interrupt.

**Defaults accepted:**
- Q4: on desktop open, start sites that have enabled routines.
- Q5: no BYOK routines in v1.
- Q7: an approval pending at quit becomes interrupted/expired, and the next slot is kept.
- Q1: skipped slots are diagnostic only.
- Q2: no catch-up when the assistant is re-enabled.
- Q3: pausing or deleting does not stop the active run.
- Q6: Codex is refused with "Codex can't run routines yet. Choose another agent."

## P4 Errors — `sheet-p4.md` (10 sheets: 6 Jini, 4 Tovu)

Sheet status: `SHEETS r62t-sheet-p4 PARTIAL`. The PARTIAL is deliberate: J3a and J3b are on HOLD because the consumer gate fails, and T4 is NOT-SHEETED because it already landed. Nothing else is cut off.

**Cross-cutting fix — affects J2, J4 and J5.** The sheets inject `runOperation`, `startOperation`, `endOnce`, `reportInternalError` and `onReporterBreach` as extra ports. These are not in the design, which defines `RouteErrorPorts = { reporter; observability }` (CM-3.6). They are pure functions, so the inject-everything rule does not require injecting them. Remove them and import them from `@jini-ai/core/errors/reporter` (`J/core/package.json:143`). Leaving them in changes the public contract and makes the J3b mount-time message wrong.

| sheet id | verdict | exact fix text |
|---|---|---|
| P4-J1.J | APPROVE | Faithful to the design: refusal selection is split out, `own-message` never shows its own text, there is a canary test, and `reporter.test.ts:278` is kept. The current `reporter.ts:163` already falls back, so the new test pins today's behaviour; the mutation turns it red. The sheet itself admits (`:55`) that a deleted changeset cannot be proven against the merge-21 baseline. |
| P4-J2.J | FIX (Opus builds) | **(1)** `:119`: drop `runOperation` and `onReporterBreach` from the port bundle. http-kit and the Fetch route import `runOperation`, `startOperation`, `endOnce` and `NOOP_OPERATION_TRACKER` from `@jini-ai/core/errors/reporter`. **(2)** `:121`: change `errors?: RouteErrorPorts & { reportInternalError }` to `errors?: RouteErrorPorts`. `presetRouteHost` imports `createReporterRouteInternalError` from `@jini-ai/http-kit`; server already imports that package (`J/server/src/route-host.ts:10`). Delete "Do not introduce a server runtime import of the new http-kit factory". **(3)** `:117`: name the repoints for the `ClientFacingError` move. Add `export * from './server/client-facing-error.js';` after `J/core/src/contracts/server.ts:130`. Repoint `core/src/errors/reporter.ts:11`, `core/src/errors/__tests__/reporter.test.ts:7` and `core/src/errors/__tests__/boundary.test.ts:2` to `../contracts/server/client-facing-error.js` (relative depth per file). Split the import at `core/src/contracts/server/__tests__/json-route.test.ts:3`. `json-route.ts` imports from `./client-facing-error.js`. **(4)** `:123-126`: cite `ALGO-P4-errors.md:134-160` as the body for `legacyAnswer`, `tracedAnswer` and `verdictFor`. **(5)** Split into J2a (core: `runOperation` fix, attributes, dedupe, `ClientFacingError` move, Fetch route) and J2b (http-kit Express, raw route, node bridge, server preset). It is about 25 files in 3 packages. |
| P4-J4.J | FIX (Opus builds) | **(1)** `:149,156`: remove the injected `operation: ToolOperationPorts`. The daemon imports core's `startOperation`/`NOOP_OPERATION_TRACKER` directly, per `ALGO-P4-errors.md:258`. **(2)** `:149`: keep the field name `toolFailures`, typed `{ mintErrorId: () => string; redactSecretShapes: <current type in redaction.ts> }`. Delete `onFailure`. **(3)** Hidden global sink (coordinator verified): `J/daemon/src/http/delegated-tools.ts:220` calls `createConsoleLogger(...).error` when `describeInternalError` throws. In reporter mode, route that to `reporter.record({ error, step: 'Describe delegated failure', operation: 'tool.call' }, { errorId })`, or to the injected logger. Add the test `a throwing describeInternalError writes no console line and keeps one id`. **(4)** `:173`: stripping the legacy sink breaks Tovu fixtures (`delegated-tool-error-disclosure.test.ts:54`, `agent-daemon-server.typed-tools.integration.test.ts:136`, …). Note that J4 ships in the same coordinated cut as T3, and list those fixtures in T3. |
| P4-J5.J | FIX | **(1)** `:188`: remove `runOperation` from `errors` and import it from `@jini-ai/core/errors/reporter` (sidecar already imports core, `json-ipc.ts:14,21`). **(2)** `:196`: define `type IpcFailurePorts = { mode: 'legacy'; logger: Pick<Logger,'error'\|'warn'> } \| { mode: 'reporter'; errors: NonNullable<JsonIpcServerOptions['errors']>; logger: Pick<Logger,'error'\|'warn'> }`. Pass it in the REQUIRED object of `bindJsonIpcSocket` (today `Record<string, never>`, `json-ipc.ts:196-198`), `bindJsonIpcData`, `parseAndDispatchJsonIpcFrame` and `dispatchJsonIpcHandler`. **(3)** `:181`: the named mutation is caught only if the test watches the console. Add: "`vi.spyOn(console, 'error')`; in reporter mode assert 0 calls, `recordingLogger.error` called 1 time, `reports.length === 1`". |
| P4-J3a.J | FIX (HOLD justified; make it a sheet) | HOLD follows the design's step-1 gate (`ALGO-P4-errors.md:224`). Merge-21 has 31 Tovu test files plus 1 production file on the legacy symbols, against the 6 the design expected. Replace the open-ended STOP at `:204` with a named sheet **P4-T3b (Tovu, after T3)**: (a) in the 31 test files (`grep -rln "reportRouteInternalError\|onInternalError" apps --include=*.ts`), replace the legacy import with one shared fixture, `createReporterRouteInternalError({ reporter: createRecordingReporter().reporter })`; (b) bind `errors` at the 7 production mount sites: `modules/capped-route-app.ts`, `modules/widgets.ts`, `modules/forms-admin.ts`, `inbound/admin-http/dev-auth.ts`, `admin-json-route-ports.ts` and `admin-raw-route-ports.ts`. Fix the anchor at `:17`: the Tovu binding is `W/platform/express/jini-routes.ts:11,192-199`, not `W/server/runtime/composition/jini-routes.ts` (coordinator verified the move). |
| P4-J3b.J | FIX (HOLD justified) | Same gate. With the J2 fix applied, the mount-time message at `:216` (`Pass errors: { reporter, observability } when mounting JSON routes.`) is accurate. Add the design I3.4 guard as an exact command: `git grep -c onInternalError -- packages/{core,http-kit}/src ':!**/__tests__/**'` must return 0. |
| P4-T1.T | APPROVE | Anchors are exact (`agent-daemon-server.ts:54`, `process-root-parity.test.ts:423`, `idioms.ts:32`). Nit at `:222`: pick "extend the existing test" and delete the "or add a companion" alternative. |
| P4-T2.T | FIX (Opus builds) | **(1)** Wrong paths at `:17,24,266`: use `W/platform/express/jini-routes.ts` (`mountJiniRoutes` at `:29-39`, `createNodeDispatcher` at `:34`, `daemonRouteHost` at `:192-199`) and `W/platform/express/__tests__/jini-routes.unit.test.ts:132`. **(2)** `:268`: name the 7 mount sites from the J3a row, and delete the escape "If the current mount wrappers cannot take the host binding… STOP". **(3)** `:272`: the root `package.json` manifest lines are core `:147`, daemon `:148`, http-kit `:152`, server `:166` and sidecar `:167`, plus the http-kit override at `:123-125`. **(4)** `:256`: name `createErrorCatalog` (`J/core/src/errors/catalog.ts:172`). Pass `{ redaction: TOVU_ERROR_REDACTION_OPTIONS }` as the second argument of `createErrorReporter`. Name the server-side build-constant module that supplies `versions.app` and `versions.jini`. **(5)** Secret leak: core's `reportToTracker` (`J/core/src/errors/reporter.ts:110-127`) hands the raw `error` to the tracker without the per-call `exactSecrets`, although the comment at `:145` claims otherwise. Add a provider canary test: `record` with `exactSecrets: ['canary-secret']`, then assert the canary is absent at the provider. If red, Opus fixes it in core: forward `exactSecrets` on `ErrorReport.context`, and have `trackerReportPort` pass it to `redactedTovuError({ error }, { exactSecrets })`. |
| P4-T3.T | FIX (Opus builds) | **(1)** `:278`: the mutation "restore the noop skip" is in Jini, not Tovu. Replace it with "build a second `createTovuErrorReporter` inside `createScopeToolExecutor` instead of using the shared one"; the ID-equality assertion then fails. **(2)** Add the Tovu fixtures that J4's sink removal breaks (see J4). Anchors are correct: `agent-daemon-scope-tools.ts:121`, `agent-daemon-scope.ts:197`, `tool-recovery-preset.ts:70-113` (the global `console.error` `[tool-failure]` sink at `:77` is the one removed), `byok-tool-surface.ts:573`. |
| P4-T4 | APPROVE (NOT-SHEETED justified) | Already landed as Tovu `04d030b5a`. Mark the stale `INDEX.md:48-51` rows (P4-T4-R, T4-1, T4-2, T4-3) "LANDED 04d030b5a; Opus regression reconcile only". |
| P4-T5.T | FIX | `:294` ("If tests prove two writes… change only the redundant write") is a decision made at test time, which Sol cannot do. Make T5 a deterministic test-only commit with 3 tests: `a public route failure is reported once`, `an unreported 5xx still produces the http.request marker`, and `browser telemetry still reaches the tracker` (`W/server/inbound/admin-http/routes/system/__tests__/browser-telemetry.unit.test.ts`). In reporter mode each test expects 0 `console.error`, exactly 1 `logger.error` and 1 `tracker.error`. Add "no production deletion in this commit". Opus retires the `reportServerFailure` legacy arm (`admin-failure.ts:54-64`) once every caller passes `reporter`, so a sink is removed only after duplicates are proven. |

**Anchors checked:**
- **Jini, all correct:**
  - `J/core/src/errors/reporter.ts:157-169,222-239`, where the `runOperation` defect is confirmed
  - `catalog.ts:13-31,172`
  - `json-route.ts:76-100,217,292-305`
  - `contracts/server.ts:130`
  - `observability.ts:52,59`
  - `J/http-kit/src/{adapter.ts:37-95,middleware.ts:23-35,node-bridge.ts:46-64}`
  - `J/server/src/route-host.ts:10,34-48`
  - `create-local-node-daemon.ts:124,387`
  - `J/daemon/src/http/route-table.ts:52-60`
  - `delegated-tools.ts:84-98,228-234`, plus the undocumented sink at `:220`
  - `tool-recovery/{observability.ts:80-111,stack.ts:57-95,redaction.ts:119,145,240}`
  - `J/sidecar/src/json-ipc.ts:84,163-178,196,379,390`
- **Tovu, correct:**
  - `agent-daemon-server.ts:54`
  - `process-root-parity.test.ts:423`
  - `admin-failure.ts:32,54-64,70-82,126-135`
  - `app.ts:419,431`
  - `observability-middleware.ts:86-90,119-131`
- **Tovu, moved:** `W/server/runtime/composition/jini-routes.ts` and its unit test are now under `W/platform/express/`.
- **Tovu, off by one:** the sheet's root `package.json:147` is core, not daemon (daemon is `:148`).

**Build recommendation:** apply these fixes before Sol runs anything.
- Sol can execute J1 and T1 as they are.
- After their fixes, Sol can execute J5, and T5 as a test-only commit.
- Opus builds J2 (split into J2a and J2b) and J4. Both are cross-package and depend on ordering: end the operation before writing, and decide refusal versus incident.
- Opus builds T2 and T3, which carry secret-leak risk: the `exactSecrets` gap and per-site tracker isolation.
- J3a and J3b stay on HOLD until the new P4-T3b migration sheet lands. Then J3, J4, T2 and T3 go out as one coordinated breaking cut.

**Owner questions:** none; all were decided on 11-21. The sheet's defaults (Q-J2a through Q-T2b) are accepted. The `exactSecrets` gap is a technical fix, not an owner question.

## P5 Import history — `sheet-p5.md` (8 sheets: 4 Jini, 4 Tovu)

Sheet status: `SHEETS r62t-sheet-p5 COMPLETE`.

**Migration verdict.** The sheet puts the import index in a dedicated sidecar file, `<ws>/site-imports.db`, with its own runner (`:88,102`). That is correct. It does not touch the Tovu content chain, `checksums.ts`, `source-digests.ts`, the Drizzle journal or `freshSiteOperations`: the sidecar creates itself through `migrateImportIndex` on a create-capable open. No VACUUM, no chat deletion, no login deletion. The automatic deletions (the 30-day sweep and snapshot retirement) are owner-decided retention, so no approval card is required (ALGO-P5 line 512).

| sheet id | verdict | exact fix text |
|---|---|---|
| P5-T1.J | FIX | **(1)** At `:52`, spell out the file names (from ALGO-P5 §T1.1, lines 50-57): `dir=<root>/payloads` (0700), `marker=<root>/payloads/.namespace-v1`, `upload=<dir>/<uploadId>.upload.zip`, `uploadMeta=<dir>/<uploadId>.upload.json`, `stage=<dir>/<importId>.stage`. These keep the legacy basenames from `import-registry.ts:8,98-99`, so the move is a same-basename rename. **(2)** At `:60`, give exact copy for each failure. EACCES/EPERM: 503 `IMPORT_PAYLOADS_UNMOVABLE`, "Imports are paused because the app could not move its import files. Check that the app can write to its data folder, then try again." ENOSPC: 507 `IMPORT_PAYLOADS_UNMOVABLE`, "There is not enough free disk space to prepare imports. Free up space and try again." |
| P5-T2.J | FIX | **(1) Neutrality** (coordinator verified): at `:92`, a Jini package creates the table `tovu_migrations`. Rename it to `site_import_migrations` (precedents: `commerce_payments_migrations`, `owner_migrations`). Preferred pin: have the test import `IMPORT_INDEX_V1_DDL` and hash that string, so a comment cannot break the pin. The new pin is `483c2b21e3343c4b834bc499ca5136c1b7cb664a99fbd4cca6286460619549fb`, which the reviewer computed and Opus re-verifies. If the pin keeps hashing the whole file, it becomes `b17023c34d6a0fe0f86d90e28ee436489a241e544a323bbb9d1298a9c50b8edb`, and the file must contain exactly the code block, with no `@file` header or comments. **(2)** Drop `migrations/journal.ts` and the `when` stamp (`:66,84,102`). Nothing reads them: the runner keys on `user_version` plus the ledger, and Jini TS histories have no `when`. Replace the mutation at `:84` with: "change one DDL byte; or add an unknown applied id to the ledger and assert the open refuses". **(3)** At `:102`, write the inserts literally: `INSERT INTO site_import_migrations(id,checksum,applied_at) VALUES('site-imports-v1',<pin>,clock.nowMs())` and `INSERT INTO meta VALUES('schema','site-imports-v1')`. **(4)** At `:113`, inline the message table from ALGO-P5 §T2.5 (lines 306-314). **(5)** At `:66,68`: devops has no `src/react/`. Put the component at `J/devops/src/backup/site/react/ShowMoreImports.tsx`, export it as the browser subpath `./backup/site/react/ShowMoreImports`, and extend the `optionalPeers.react` text at `J/devops/package.json:92`. |
| P5-T3.J | FIX (idempotency bug) | At `:139`, `commitBackfill` "sets" `db_id`, `cutover_at`, `backfill_count` and `schema` with plain INSERTs. The migration already inserted `meta.schema`, and a rerun after a crash between commit and the external-state publish finds all four rows. The PK conflict then rolls back and blocks the workspace permanently. Replace the step with: "inside the same `BEGIN IMMEDIATE`: `DELETE FROM imports; DELETE FROM replay; DELETE FROM meta WHERE key='last_sweep_ms';` insert rows and fences; then for each of `db_id`,`cutover_at`,`backfill_count`,`schema` run `INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`; `backfill_count` = `SELECT COUNT(*) FROM imports` read inside the transaction". Add "a candidate DB already holding a committed marker from a prior attempt" to the setup of the `:129` test. |
| P5-T4.J | FIX (Opus builds) | **(1)** At `:165`, fix the witness path to `<root>/.history-indexed-v1`, written with `wx` and mode 0600, then file fsync, then a root-directory flush. **(2) Retirement must not delete the only copy** (`:166`). Delete only regular files matching `^<uuid>\.json$` (checked with lstat) whose `mtimeMs <= state.cutoverAt`. A newer file can only come from a pre-P5 build after a downgrade, so it is the only copy of that import: keep it and log only the count. Set `legacyRetiredAt` once no file with `mtime <= cutoverAt` remains. Add a `stat({file}) → {kind,mtimeMs}` port and the test `retirement keeps a history file written after cutover` (mutation: drop the mtime predicate). **(3)** At `:162-166`, add the `errors.ts` code `IMPORT_HISTORY_MISSING`: 503, "Import history is missing, so imports are paused to avoid creating the same site twice. Nothing was changed. Contact support with this error ID." |
| P5-T1.T | FIX | T1.J allows status `503 \| 507`, but `W/server/inbound/shared/admin-failure.ts:18` is `status?: 503` (coordinator verified), so T1.T does not typecheck until T2.T widens it. Move the widening from `:210` into T1.T, add `admin-failure.ts` to the T1.T Files line (`:178`), and remove it from T2.T. |
| P5-T2.T | FIX | **(1)** At `:214`, the golden base is stale. `W/assistant/__tests__/fixtures/moved-tools.golden.json:535` is `762098`, not `760493` (coordinator verified). After +92 bytes the expected value is **`762190`**. **(2)** Replace `"site_import_list takes no fields."` (`tool-registrations.ts:242`) with `SiteShareRefusal({code:"INVALID_INPUT",message:"site_import_list accepts only cursor."})`. **(3)** At `:218`, choose one option: "Pass the `Button` from `useAdminKit()` in `ImportList`'s host binding". Delete the alternative. **(4)** At `:193`, give full hook paths. In particular `A/features/sites/hooks/site-transfer-rules.ts:65` changes `port.listImports()` to `port.listImports({})`; an unrelated `A/features/sites/site-transfer-rules.ts` also exists. **(5)** Remove the `FailureOptions` widening, which moves to T1.T. |
| P5-T3.T | APPROVE | Depends on the T3.J upsert fix. Production does not call it until T4, there is no aside-move, and logs carry counts only. |
| P5-T4.T | FIX (Opus builds) | **(1)** At `:255,267,271`, record Q5 as decided (owner: accept with a release note, no freeze). Keep `cutoverPolicy:"rollback"` in this commit. Replace "Production enablement stops at Q5 … until the owner explicitly confirms" with: "after Opus passes the copied-legacy-folder Chrome/Electron verification (`:273`), Opus lands a one-line commit flipping `cutoverPolicy` to `"enable"` in `W/server/runtime/composition/site-import-backend.ts`". **(2)** At `:244`, bind the T4.J `stat` port to `fs.lstatSync(file).mtimeMs`, and pin the retirement-keeps-newer test against the host binding. **(3)** At `:234`, replace "Extend the retention fixture as needed" with named helpers: `seedIndexState({mode,dbId,cutoverAt})` and `seedWitness({})` in `B/__tests__/import-history-index.fixture.ts`. |

**Anchors spot-checked:**
- **Correct:**
  - `B/import-registry.ts:10,31,35,50-53,98-99,108-118,136-146`
  - `B/import-backend.ts:24-32`
  - `import-backend-steps.ts:32,78`
  - `W/server/runtime/composition/site-import-backend.ts:39`
  - `W/server/inbound/admin-http/routes/system/site-imports.ts:86-89`
  - `admin-failure.ts:18,79`
  - `B/__tests__/import-history-retention.unit.test.ts:27,42` (the Q4 titles)
  - `B/tool-registrations.ts:91-92,211,235-249`
  - `W/platform/db/kernel/drivers/sqlite.ts:48`
  - `site-deps/site-imports.ts:21`
  - `mount-admin-system.ts:193`
  - `W/cli/commands/import-local.ts:15,43`
  - `A/features/sites/hooks/site-transfer-dependencies.hooks.ts:51,85,155,185`
  - `openapi/` (the next fragment, `022`, is free)
  - `J/cms/src/admin-http/routes/system/site-imports.ts:59-139`
  - `J/http-kit/src/adapter.ts:37`
  - `J/platform/src/fs/atomic-write.ts:44,206`
  - `J/core/src/contracts/runtime/file-lock.ts:19,57-59`
  - `J/core/src/contracts/storage/sqlite.ts:31-34,41,65-67`
  - `J/devops/package.json:71-76`
- **Wrong:**
  - The golden value `760493` is gone; the current value is `762098`.
  - `J/core/src/contracts/server/json-route.ts:157` has moved to `161`.

**Build recommendation:** apply the fixes before Sol runs anything.
- After the fixes, Sol can execute T1.J, T2.J, T3.J, T1.T, T2.T and T3.T.
- Opus builds T4.J and T4.T. They depend on crash ordering: mode resolution, the state → witness → SQL write fence, quarantine with WAL/SHM, latch-on-refusal across every backend method including CLI tidy, and retirement scope. Only real-disk mutation runs can prove these.

**Owner questions:** none.
- Q4: kept as written.
- Q5: accepted, with no freeze.
- Accepted defaults: Q1–Q3 and Q6–Q11 as in the sheet, plus the sheet's stricter `.history-indexed-v1` witness, which fails safe.

## P11 Storage budget — `sheet-p11.md` (43 sheets: 18 Jini, 25 Tovu)

Sheet status: `SHEETS r62t-sheet-p11 PARTIAL`. Six anchors (G1–G6) are missing from merge-21: G1–G3 are the Jini SQLite compaction anchors, G4–G5 are share expiry and G6 is the storage-report CLI. Every sheet that depends on them is correctly fenced behind STOP or "waits for". There is no Tovu ST-8c sheet; this is deliberate, because STOP 5 keeps it report-only.

### P11 Storage budget — Jini half (18 sheets)

**Base drift:** the sheet was verified at Jini `dc2349f51`, but the `origin/integ/merge-21-2026-11-24` tip is now `010c8cd87`, a descendant that changes 161 more files. Media anchors moved: `media-service.ts:460` is now at `:447`, `:896-933` is now at about `:883-923`, `replace-media-file.ts:112` is now at `:113`, and `json-route.ts:108-126,157` moved down by 4 lines. The drift also adds upload-cap changes in `cms/media/site/{duplicate-asset,import-media-entity}.ts` and `servingOrigin` in `json-route.ts`. Sol should re-read each named function by name rather than trusting line numbers.

**Shallow clone:** the restore source `1b7dcff86` (ST-7a) exists only in full Jini history, and a fresh shallow clone cannot `git show` it. The executor must run `git fetch --unshallow` first.

| sheet id | verdict | exact fix text |
|---|---|---|
| ST-7a.J | REJECT for Sol (Opus builds; STOP G1–G3 stands) | The source `1b7dcff86` exists, but its `convertToIncrementalVacuum` is 110 lines (71-181, over the 80-line limit) and exports a module-level `nodeCompactionFs` bound to `node:fs/promises`, which breaks the inject-everything rule. Fixes for `sheet-p11.md:38`. **(1)** Pin owner rule (b) with tests `step inside an open transaction throws` and `conversion refuses a handle inside a transaction` (I-7a.1). **(2)** Name the ports: add `tempDirectory(): string` to `SqliteCompactionFs` (D7a-1); add `'copying'` to the marker `state` union in `core/src/contracts/storage/sqlite-compaction.ts` (D7a-2); rename the lease probe to `holdsRunningLease()` and call it at entry, after admission and before `rewriting` (D7a-5). **(3)** Delete the `nodeCompactionFs` default, since fs becomes required. **(4)** Put tests in `db/src/sqlite/__tests__/compaction.test.ts`, the current layout, not the historical `db/src/__tests__/sqlite/`. **(5)** Split convert into `admit`, `budget`, `copy`, `rewrite` and `mark`, each 80 lines or fewer. |
| ST-7b.J | FIX | `:40`: "cannot be presented as a routable listener" leaves the mechanism to Sol. Replace it with the following, all in `platform/src/fs/directory-running-lock.ts`. `validRunningRecord` requires `port === 0` when `purpose === 'maintenance'`. `update({token,port})` throws "A maintenance owner has no address." for a maintenance record. Export `isServeRecord({ record }, {})`, which is true only when `purpose` is missing or `'serve'`. Rename the test to `contested claim returns the maintenance record (incl. legacy record without purpose = serve)`, because the "server waits" loop lives in Tovu `site-running.ts`. |
| ST-8a.J | FIX | `:42`. **(1)** Schema: `ai_chats.pinned_at INTEGER NULL` and index `ai_chats_owner_cleanup(scope_id, owner_kind, owner_id, pinned_at, updated_at)` go in `chat/src/store/sqlite/schema.ts` after line 52; the column goes in `sql/tables.ts`. The name and columns must match Tovu ST-9.T. **(2)** Add `setPinned`/`updateConversation` to `ChatStore` (`store/ports.ts`) and implement them in `sql/store.ts` next to `rename` (`:480`, `:610`). Do NOT add them to the `ChatHistoryStore` Pick at `:135`, so existing host fakes still compile. **(3)** `createChatCleanupRoutes({ paths:{ patch, preview, apply, deleteSelected }, bulkDeletionFor, previewStore, store }, {})` returns four `defineJsonRoute` specs, with `requireSameOrigin: true` on writes. Paths are injected; no Tovu URL is hard-coded. **(4)** `delete-selected` requires `{ ids, confirm: true }`. Add the test `delete-selected without confirm is refused` (owner deletion always confirmed, X6). |
| ST-8b.J | FIX (minor) | `:44`: name the header files `chat/src/react/features/conversation-chat-pane/components/ConversationChatPaneHeader.tsx` and `ConversationChatPane.tsx`. State that `defaultConversationListHooks` stays exported while `hooks` becomes a REQUIRED prop (a major bump that flags Tovu ST-10). |
| ST-8c.J | FIX (Opus builds) | `:46`: the reader matrix leaves out two Jini readers the design lists: `chat/src/store/runtime/durable-run-store.ts:509` (`hasUnknownToolCall({ events: run.attemptBase })`) and `store/runtime/kernel.ts:22` (row type). Add both to the anchor table and to `attempt-base-readers.test.ts`. `readerProof` is `{ verifiedReaders: readonly string[] }`; the policy stays report-only unless it equals the exported `ATTEMPT_BASE_READERS`. Move `signal` from the factory to the per-run sweep call. The proof gate needs test runs. |
| ST-11a.J | FIX (Opus builds) | `:48`: two byte writers bypass the fence (coordinator verified both): `cms/src/media/site/import-media-entity.ts:327` (`findByHash` then `putIfAbsent`; a tombstoned row counts as "existing") and `cms/src/admin-http/routes/publish-content/blob-put.ts:73` (`putIfAbsent` before any row exists). Route both through `claimWrite`. Make the Jini default fail closed: `{ graceMs = 30*DAY, allowTrashTtl = false } = {}`. Only the host binding may set `true`. Fence: `kernel.lockKey('blob:<workspaceId>:<storageKey>')` inside `kernel.transaction` (design §17). |
| ST-12a.J | FIX (minor) | `:50`: in `siteShareCreateRoute` (`site-shares.ts:146-150`), when `input.jobId` is a string, pass only `{ jobId }` and drop `expiresInDays`, so a poll cannot revise expiry. Rename the second test to `list passes a row with url:null and no storage through unchanged`. |
| ST-12b.J | FIX | `:52`: `devops` has no `src/react/`. Follow `src/deploy/react`: add `jini.entries["./react/site-share-expiry"]: "browser"`, an `exports` block, a `typesVersions` entry, and the existing optional-react message (`devops/package.json:24,92,140`). Tests use a `// @vitest-environment jsdom` header. |
| ST-13.J | FIX | `:54`: this moves the design's Tovu feature (§20) into Jini `cms/posts`. Record the deviation (see owner question 2). Ports: `revisions: { withPostLock({ scope, run }, {}), listOldest({ scope, olderThan, limit }, {}), newestId({ scope }, {}), deleteIds({ scope, ids }, {}) }`, and `protections: { isPublished, isRestoreTarget, isRestoredFrom, isUndoReferenced }`, each `({ scope, id }, {}) => Promise<boolean>`. A throw means the revision is kept. Add `restored_from` to the kept test. Ship it disabled (STOP 6). |
| ST-15a.J | FIX | `:56`: the input is `{ dryRun?: boolean; classes?: string[] }`. Any class outside `cache\|derived\|old-copy` is refused with injected plain copy, in both modes. Name the permission passed to `ports.authorize` (`'storage.manage'`). Set `requireSameOrigin: true` on cleanup. |
| ST-17.J | FIX | `:58`: `platform` has no JSX setup (no `jsx` in its tsconfig, no react peer). Decide here, not in the executor: place the view in `@jini-ai/admin` (which already has `react/` and `screens/`). The alternative, adding `"jsx": "react-jsx"`, an optional react peer and a browser entry to platform, widens a node package. The design (§23) put this screen in Tovu; record the deviation. |
| ST-17s.J | FIX | `:60`: "Completed" and "the capture writer's exclusion" do not exist. `integrations/src/web-screenshot/capture-files.ts:31-47` writes the final path directly with `wx` and takes no lock. Add an edit: `createCaptureFileWriter({ rootDir, lock }, {})` writes `<name>.partial`, renames it into place, and holds the injected `lock.withLock({ key: rootDir, run })`. Retention lists only non-`.partial` regular files (lstat, no symlinks) under the same lock. Add the test `in-progress capture is kept`. |
| ST-6c.J | FIX | `:62`: the design (§9.7) puts this helper in Tovu `W/platform/temp/owned-root.ts` ("not now, one consumer"). Record the move to Jini or revert it. Add design step 7 (a `.lock` with a dead owner and no root is removed via the stale-break path) and the I-6c.6 test `symlinked root skipped`. Rephrase the mutation as "match by prefix without the exact UUID pattern"; Jini tests must not contain `tovu-`. |
| ST-2a.J | FIX (Opus builds) | `:64`: the sheet usefully hardens the design (a quiet `seq` no longer breaks the fence), but `abandonMs = 5000` has no stated effect. Say it is diagnostic-log only, or remove it. Add the design's fail-closed rule: if `registerHolder` fails, `acquireSiteSession` refuses every open with injected copy. Add the test `unregistered process cannot acquire`. The model-checked interleavings (T-2a.13) need test runs. |
| ST-2b.J | APPROVE | — |
| ST-1.J | FIX | `:68`: define the evidence type in the partitions leaf: `type PackagedEvidence = { cap: 'go'\|'no-go'\|'unknown'; clearOps: { clearCache: 'go'\|'no-go'\|'unknown'; clearCodeCaches: 'go'\|'no-go'\|'unknown' } }`. Anything other than `'go'` means no mutation. Make `cacheBytes` and `capBytes` required. |
| ST-3.J | FIX (minor) | `:70`: `maybeClearCodeCacheAtOpen` has no holders port. State that it runs only as the interlock's `openMaintenance` hook (the ST-2a step 2.5 other-holder check), and write T-3.6 through `acquireSiteSession`. |
| ST-2c.J | FIX (Opus builds) | `:72`: `removeAmbiguousPartition` deletes sign-ins (owner rule a) and has no test and no `confirmation` type. Define `confirmation: { partition: string; confirmed: true; evidence: 'owner-dialog' }`. Add the tests `manual sign-in removal without confirmation is refused` and `holder appearing after confirm keeps the partition`. Replace "Fault inject every write" with the named writes: ledger transition, aside rename, restore rename and target write. |

**Owner rules (Jini half):**
- (a) ST-2a/2b/2c require positive proof, a recheck after rename, and fail closed on anything unknown. The gap is the manual path, fixed in ST-2c.J.
- (b) Never in a migration by design, but no Jini test pins it yet. ST-7a.J adds the tests.
- (c) Expiry defaults to Never, and the "14 days" mutation is caught.
- (d) No automatic chat deletion. `delete-selected` needs a confirm, fixed in ST-8a.J.

**Anchors spot-checked:**
- **Correct:**
  - `J/platform/src/fs/directory-running-lock.ts:5-11,41-76,88-105`
  - `file-lock.ts:293-300`
  - `durable-json.ts:134-136`
  - `J/platform/src/retention/runner.ts:23-35,67-81`
  - `J/chat/src/store/ports.ts:135`
  - `sql/store.ts:240,480,610`
  - `sql/maintenance.ts:12-17`
  - `sqlite/schema.ts:37-96`
  - `ConversationList.tsx:37-52,117-132`
  - `J/cms/src/media/blob-gc.ts:53,202-222,267-295,331-360`
  - `rendition-service.ts:135`
  - `site-shares.ts:19-25,47-53,139-175`
  - `J/desktop-host/src/electron/updates/instance-presence.ts:69-93`
  - `session-bootstrap/partition.ts:21`
  - `J/integrations/src/web-screenshot/capture-files.ts:7-31`
- **Moved or missing:**
  - `durable-run-store.ts:410-431` is really 427/431, and `:509` is missing from the sheet.
  - The media files moved (see the base-drift note above).
  - G1–G3 are gone from the base, as the sheet says.

### P11 Storage budget — Tovu half (25 sheets)

Codex marked this sheet PARTIAL because six G1–G6 anchors are missing from merge-21: compaction ×3, share-expiry ×2 and the storage-report CLI. The sheets that depend on them (ST-7b.T, ST-7c.T, ST-12a.T, ST-12b.T, ST-16r.T, ST-16.T, ST-18b.T) are correctly held behind STOP or "waits for". All 25 Tovu sheets are present. There is no Tovu sheet for ST-8c, which is deliberate: STOP 5 keeps it report-only.

**Shared migration fix — blocking, applies to ST-9.T and ST-11b.T. Coordinator verified it.** `sheet-p11.md:34` says "Add the new keyed value to `checksums.ts` **and `source-digests.ts`**". That is wrong. `W/platform/db/migrations/source-digests.ts:1-6` says: "A NEW step never gets an entry: it is pinned in `checksums.ts` only." Sol also cannot compute the pin, because it comes from `stripComments` in the test helper. Replace `:34` with:
- Register the step in `migrations/index.ts` with `pinned("<key>")`. Do **not** touch `source-digests.ts`.
- Sol leaves `checksums.ts` unedited. Opus runs `UPDATE_MIGRATION_CHECKSUMS=1` on `__tests__/checksums.test.ts`, which appends new ids only (`:42-46`), then reruns it without the flag.
- Add no `when` and no journal entry. The TS runners have no `when`, and the Drizzle journal is frozen at `0077` (`legacy-sqlite.ts:29,44-52`).

Fix the same text in the design, ALGO-P11 §15.1 and §18.1.

**Migration numbering:**
- The chat chain on merge-21 is `chat/0000…0003` (`index.ts:131-136`), so `0004_chat_pinned` is free and comes next.
- The content chain ends at `0045_media_captions` (`index.ts:128`), so `0046_blob_gc_journal` is correct. The design's `content/0043` is stale.
- No migration source on merge-21 contains VACUUM.

| sheet id | verdict | exact fix text |
|---|---|---|
| ST-1a.T | APPROVE (Opus + packaged Mac) | This is a harness spec that needs a real packaged Electron app and a human on a Mac. Sol must not attempt it. |
| ST-2a.T | APPROVE (Opus) | Anchors verified: exactly six `session.fromPartition` callers at `D/main/index.ts:433,576,577,578,600,625`. The sheet follows the design faithfully. It leaves too many cross-file judgment calls for Sol, such as implicit Electron creators and `beforeAddedRows` on the actual writer. |
| ST-2b.T | FIX | At `sheet-p11.md:80`, change `retirement?: {…}` to a **required** `retirement` field on `ProjectIpcDeps` (`D/project-ipc.types.ts`). Bind an explicit `NO_RETIREMENT` no-op port until ST-2b.J ships, as ST-2a.T does ("explicit no-op, not a bypass"). An optional port lets production silently skip the record. Name the insertion points. `captureRetirement` goes after `assertNoOtherServer` (`:131`) and immediately before `if (erasesFiles) await eraseProjectDirectory(...)` at `D/project-ipc.delete.ts:141`. `recordRetirement` goes between `:141` and `untrackSite(...)` at `:142`, and runs only when `erasesFiles`. Add a test that the production binding in `main/index.ts` is not `NO_RETIREMENT` once ST-2b.J is imported. |
| ST-1.T | APPROVE (Opus) | Gated on ST-1a evidence. The fail-closed rule is preserved: no switch and no clear without evidence. |
| ST-3.T | APPROVE (Opus) | Same gate. "Storage untouched" (T-3.5) pins owner rule (a). |
| ST-2c.T | APPROVE (Opus) | Insertion point verified: after `reconcileOrphansOnBoot` and `migrateNestedSitesHome`, before `bootInMode` (`D/main/boot/boot-sequence.ts:64-71`). |
| ST-6a.T | FIX | At `sheet-p11.md:88`, make five changes. **(1)** Replace "Inject P4 reporter": the P4 ERR- reporter does not exist on merge-21 (there is no `reporter.record` anywhere in `W/`). Inject a `reportError({ error, policyId }, {})` port instead, bound for now to `console.warn(formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS))` as at `W/cli/commands/serve.ts:195`. **(2)** State that `policiesForSignal` returns `[]` in this commit, because ST-6b and ST-6c register their policies later. Import `createRetentionRunner` from `@jini-ai/platform/retention` (`J/platform/src/retention/runner.ts:81`). **(3)** Delete "Include ST-8c finalizer-reader witness fixtures", or name the fixture file and its assertions; as written Sol cannot execute it. **(4)** In `W/index.ts`, start only when `runningLease` is defined, so never for `useMemory` (`:171`). **(5)** Add a test for owner rule (d), `no chat, revision, screenshot or media policy is registered`, that asserts no policy id or kind names a content class. |
| ST-6b.T | FIX | At `sheet-p11.md:90`, "Recovery binding" is vague. Name the file that reads `ops/` copies for the Recovery screen and the `holdCopy` call site. Everything else is faithful: keep 5, unknown means no delete, `quick_check` is read-only. |
| ST-6c.T | FIX | At `sheet-p11.md:92`, "Bind the six prefixes in the anchor table" fails because the anchor table (`:22`) lists files, not prefixes. Add a literal table of six `{ parentExpr, prefix, writerFile:line }` rows. The first is `tmpdir()` / `"tovu-import-db-"` at `W/features/site-backup/import-database.ts:60`. Do the same for the share-database repo `:325,399`, `static-copy.ts:166`, `sources.ts:542-553`, `share-preparation-steps.ts:43` and `database-transfer-adapters.ts:31-34`, each with its **injected** parent. State that the call at `serve.ts:195` is deleted and replaced by the policy. |
| ST-16r.T | APPROVE (STOP G6) | The restore-and-rebase steps are concrete, and the `program.ts:117-127` chain is verified. Opus only. |
| ST-16.T | APPROVE (waits for ST-16r and ST-7b.J) | Tests pin the running-site refusal text, the no-migrate rule and lease-before-writable. |
| ST-7b.T | FIX (waits for G1–G3) | At `sheet-p11.md:98`, give the exact signature change at `W/platform/site-dir/site-running.ts:20-21`: `claimSiteRunning({ dir, app, scheme = "http", purpose = "serve" }, …)`, with `purpose` forwarded to `workspace.claim`. List every caller that must pass `"maintenance"` (the current callers are `serve.ts:218` and `index.ts:171`). Opus builds this, because compaction recovery needs judgment. |
| ST-7c.T | APPROVE (waits for G1–G3 and ST-7b.T) | Converted files only, no PGlite or Postgres, budgeted, and no VACUUM in a migration. |
| ST-9.T | FIX (blocking) | At `sheet-p11.md:102`, make six changes. **(1)** "Existing `openChatDb` reaches the TS migration chain; verify it" is **false** (coordinator verified). `openChatDb` (`W/platform/db/sqlite/chat-db.ts:68-74`) is the synchronous fresh bootstrap with no ledger; `openSiteChatDb` (`:49-57`) is the path that runs the chain. In the 0004 file, export `chatPinnedStatements({ dialect }, _optional = {})`, following `activeRunIndexStatement` in `chat/0003_active_run_index.ts:9-12`, and call it in `openChatDb` after `:73`. **(2)** Name the DDL. SQLite: `ALTER TABLE ai_chats ADD COLUMN pinned_at INTEGER`. PG: `ALTER TABLE ai_chat.ai_chats ADD COLUMN IF NOT EXISTS pinned_at BIGINT`. Both: `CREATE INDEX IF NOT EXISTS idx_ai_chats_owner_cleanup ON <table>(scope_id, owner_kind, owner_id, pinned_at, updated_at)`. On SQLite, guard the ALTER with `SELECT 1 FROM pragma_table_info('ai_chats') WHERE name='pinned_at'`, because adopted chat files require idempotent statements (`chat-db.ts:43-45`). **(3)** Register step id `"0004_chat_pinned"` as `chatPinned({ checksum: pinned("chat/0004_chat_pinned") }, {})` after `index.ts:135`, with no source-digests entry. **(4)** Mount the routes through `mountAdminJsonRoute` (`W/server/inbound/admin-http/admin-json-route-ports.ts:342`) after the existing `requireAdminSession` + reconcile gates (`modules/assistant-chats.ts:323-327`). The POST routes `cleanup/preview`, `cleanup/apply` and `delete-selected` set `requireSameOrigin: true`. State whether the Jini PATCH spec **replaces** `app.patch(…renameChatRoute)` at `:331` or extends `renameChatRoute` (`:186-206`). **(5)** Owner and workspace come only from `getAuthedPrincipal(res).id` and `deps.workspaceId`, as in `storeFor` (`:100-106`). Add a wire test that a body or query `ownerId`/`workspaceId` is ignored. **(6)** Name the static test `W/platform/db/migrations/__tests__/no-vacuum.test.ts`. It recursively scans every non-test `.ts` under `migrations/` (including `chat/`, `project/` and `commerce/`) for `/\bvacuum\b\|auto_vacuum/i`. Mutation: add `VACUUM` to `0004`. |
| ST-10.T | FIX | At `sheet-p11.md:104`, put `useWiredChatCleanup` in `A/hooks/assistant-chats-dependencies.hooks.ts`; its `@file` (`:17-21`) makes it the only file that may reach the real `/api/assistant/chats` client. Add the transport methods in `A/lib/assistant-chats.ts`. `DockHeader.tsx:89` passes the hooks into `ConversationList` as **required** props with no default. |
| ST-11b.T | FIX | At `sheet-p11.md:106`, make three changes. **(1)** Replace "dialect-correct timestamps" with types that match `asset_blobs` (`0000_legacy_baseline.postgres.ts:12`, where timestamps are `text`): `purge_reason text` (nullable), and `blob_gc_journal(workspace_id text NOT NULL, storage_key text NOT NULL, sha256 text NOT NULL, kind text NOT NULL, reason text NOT NULL, journaled_at text NOT NULL, attempts integer NOT NULL DEFAULT 0, next_attempt_at text, last_error text, PRIMARY KEY(workspace_id, storage_key))`. Use the same SQL on both dialects. **(2)** Export `BLOB_GC_JOURNAL_STATEMENTS` (pattern: `0045_media_captions.ts`). Add `"0046_blob_gc_journal"` to `freshSiteOperations` (`W/platform/db/sqlite/fresh-content-db.ts:270-283`), and add `blobGcJournal({ checksum: pinned('0046_blob_gc_journal') })` after `index.ts:128`. **(3)** Replace "Do not enable sweep until…" with: register `media-bytes` as **measure/report only** in this commit, with `sweep` absent. Enabling unlinks is a separate owner-gated commit (STOP 6). |
| ST-12a.T | APPROVE (STOP G4–G5) | Owner rule (c) holds. The default is Never; an invalid stored date fails closed for serving only; missing metadata never counts as expiry. Opus only. |
| ST-12b.T | APPROVE (Opus; waits for 12a and 6a) | Only rows with an explicit `expiresAt` expire. The tombstone is written before the unlink. Remote and peer copies are never deleted. Both stream gates are named. Note that `SiteExportTab.tsx:27` already has the defaulted hook prop `useExport = useWiredSiteExport`; do not add more defaulted hook props. |
| ST-13.T | FIX | At `sheet-p11.md:112`, mount apply with `mountAdminJsonRoute` and `requireSameOrigin: true`. The tool approval uses `approvalToolHandler` (`W/contracts/core/human-confirm.ts:181`) with **no `rememberKey`**, as in `mail_clear_captured` (`W/features/mail-status/delivery-tool-registrations.ts:119-124`). Add the test `approval card raised before any revision delete; decline deletes nothing`. The lock at `post/repo.ts:330` and `recorded_at`/`restored_from` at `repo.rows.ts:230-231,250-251` are verified. |
| ST-15b.T | FIX | At `sheet-p11.md:114`, `authorizeOwner` must name the existing owner-role check it binds; as written, "not builtin admins" is left to Sol. Mount with `mountAdminJsonRoute`. |
| ST-15c.T | FIX (blocking) | At `sheet-p11.md:116`, replace `confirmation:'always'`: it does not exist in Tovu's tool contract (coordinator grep found no use), so the design invented it. Use `approvalToolHandler({ surfaces, prepare, describe, run }, { flag: "cleaned", ask: ({ prepared }) => prepared.dryRun === false })` with no `rememberKey`. Add `W/features/storage/agent-tools.ts`, a catalog module that `buildDomainRegistrations` requires (see `delivery-tool-registrations.ts:95`). Add `storageDerivedRisk = new Map([["site_storage_report","none"],["site_storage_cleanup","mutates-durable-state"]])`; the contributor is `{ domain: "system-storage", build, risk }`. Test: the human-confirm step runs before `runOnce({ dryRun:false })`, and a decline never calls it with `dryRun:false`. |
| ST-17s.T | APPROVE | Runs only when the owner explicitly asks, and registers nothing automatically. Mount with `mountAdminJsonRoute` and same-origin apply. |
| ST-17.T | FIX | At `sheet-p11.md:120`, "bind panel navigation in the existing admin composition" is vague. Name the nav/route registry file under `A/` and the Jini subpath that exports `StoragePanel` (from ST-17.J). Pass `useWiredStorage` as a required prop. |
| ST-18a.T | APPROVE (Opus) | State that `@tovu/contracts/desktop-storage` needs **no** package.json export, because of the wildcard `"./*"` at `packages/contracts/package.json:11-14`. Rechecks run at action time, there is no `rm` fallback, and removal is owner-initiated only, so rule (a) holds. |
| ST-18b.T | APPROVE (waits for ST-16 and ST-7b.T) | Gated on capability; a running site goes to the owner HTTP preview/confirm. |

**Anchors spot-checked (all correct):**
- `W/platform/db/migrations/index.ts:125-136`
- `checksums.ts:67-70`
- `source-digests.ts:1-8`
- `__tests__/checksums.test.ts:26-56`
- `W/platform/db/sqlite/chat-db.ts:44-74` (coordinator re-read it)
- `fresh-content-db.ts:272-284`
- `modules/assistant-chats.ts:100-106,184-226,317-334`
- `admin-json-route-ports.ts:328-351`
- `delivery-tool-registrations.ts:119-124`
- `W/cli/program.ts:117-127`
- `cli/commands/serve.ts:195,218-231`
- `W/index.ts:170-172`
- `post/repo.ts:316-343`
- `repo.rows.ts:217-251`
- `share-registry.ts:85-119`
- `public-http/routes/site-share.ts:10-26`
- `A/features/sites/SiteExportTab.tsx:27`
- `A/components/AssistantDock/DockHeader.tsx:89`
- `D/main/index.ts:433,576-578,600,625`
- `D/main/boot/boot-sequence.ts:64-71`
- `D/project-ipc.delete.ts:111-171`
- `W/platform/site-dir/site-running.ts:20-46`
- `import-database.ts:60-62`
- `J/platform/src/retention/runner.ts:81`
- `J/chat/src/store/sqlite/schema.ts:37-60`

**Owner rules (Tovu half):**
- (a) Only the erase arm records a retirement, and the T-2b.2 untrack + re-add test keeps the login.
- (b) No VACUUM in a migration: the static test is in place once ST-9.T names its file.
- (c) Only rows with an explicit `expiresAt` can expire.
- (d) No chat policy is registered, ST-15c refuses chats, and the ST-6a fix adds a pinning test.

## Build recommendation per feature

| feature | recommendation |
|---|---|
| **P3 Routines** | **Fix first, then split the work.** Sol builds J1, J2 (rebuilt on the commerce migration precedent, with no journal), T2.J, T2.T and T4.T; Opus reviews T2.T's marker-stripping and admission tests. **Opus builds** T3.J+T3.T together (the receipt transport is still an open design choice, and approval must be observed, never redeemed), T1.T split into T1a/T1b (desktop eligibility, IPC, drain-before-close), and T5.J if the screen stays in Jini. Opus also adds a lease test for sleep past the 90 s TTL, so a waking passive peer cannot interrupt the owner's live run. |
| **P4 Errors** | **Fix first.** Sol builds J1 and T1 as they are. After their row fixes, Sol builds J5 and T5 (T5 as a test-only commit). **Opus builds** J2 (split into J2a/J2b), J4, T2 and T3: these depend on ordering and carry a secret-leak risk (`exactSecrets` is not forwarded to the tracker, `J/core/src/errors/reporter.ts:110-127`). J3a/J3b stay on HOLD until the new P4-T3b consumer-migration sheet lands. Then J3, J4, T2 and T3 ship as one coordinated breaking cut. |
| **P5 Import history** | **Fix first.** Sol builds T1.J, T2.J, T3.J (with the meta-upsert idempotency fix), T1.T, T2.T and T3.T. **Opus builds** T4.J and T4.T (crash-ordered write fence, retirement scope). Opus flips `cutoverPolicy` to `"enable"` only after the Chrome/Electron verification. |
| **P11 Storage budget** | **Fix first. Opus builds most of it.** After the fixes, Sol can build: Jini ST-7b, 8a, 8b, 12a, 12b, 13, 15a, 17, 17s, 6c, 1, 3 and 2b; Tovu ST-9, 10, 11b (report-only), 6a, 6b, 6c, 13, 15b, 15c, 17 and 17s. ST-8a, 9, 13 and 15c keep their OPUS-CHECK review: deletion behind the approval card, owner and CSRF checks, migration pins. **Opus builds** Jini ST-7a (rejected for Sol: an off-base VACUUM path that breaks the 80-line and inject-everything rules), 8c, 11a (two unfenced byte writers), 2a and 2c (sign-in deletion). Opus also builds every Tovu desktop sheet (ST-1a, 1, 2a, 2b, 2c, 3, 18a, 18b), plus Tovu ST-7b, 7c, 16r, 16, 12a and 12b. |

### Sheet order and the Jini/Tovu split

The order is correct in every feature. Jini sheets do not depend on Tovu, and the Tovu sheets name the Jini artifact they need. There are four corrections:
- **P3-T1:** add the P7-J2 prerequisite (`INDEX.md:35`).
- **P4:** add the new P4-T3b sheet before J3a/J3b.
- **P5:** move the `FailureOptions` widening from T2.T into T1.T.
- **P11:** ST-8b.J makes the hooks prop required, which is a major bump. Tovu ST-10 must take that version.

### Owner rules for P11, after the fixes

- **(a) Logins are never erased for a live site.** Removal needs positive proof, a recheck after rename, and fails closed on anything unknown. Only the erase arm records a retirement, and the untrack + re-add test keeps the login. The manual removal path gains a typed confirmation and tests (ST-2c.J).
- **(b) No VACUUM in a migration.** A new static test (`W/platform/db/migrations/__tests__/no-vacuum.test.ts`) and two Jini transaction tests (ST-7a) pin this rule. Today no Jini test pins it.
- **(c) Live share links never break.** The default is Never. Only rows with an explicit `expiresAt` expire. Missing metadata never counts as expired.
- **(d) No automatic chat deletion.** No chat policy is registered (a new pinning test is added in ST-6a.T), ST-15c refuses chats, and `delete-selected` requires `confirm: true`.

## Owner questions that need the owner

1. **P3, live admin-assistant toggle.** Build it, or accept enable/disable at boot only for v1? Default in this review: boot-only for v1. T1 binds an inert `onAssistantToggle` seeded from the env switch. This is why the P3 sheet is PARTIAL.
2. **Screens moved from Tovu to Jini, against the design.** The affected screens:
   - P3 Routines screen: Jini `daemon/routines/react`, where the design has Tovu `A/features/routines`.
   - P11 ST-6c temp roots.
   - P11 ST-13 revision thinning.
   - P11 ST-17 storage panel.
   - P11 ST-12b expiry controls.

   Default: accept the moves where the code is generic and the host injects everything (ST-6c, ST-13, ST-12b, ST-17 placed in `@jini-ai/admin`, not `platform`). For P3-T5, revert to the design's Tovu screen unless the owner wants it in Jini.
3. **P3 and P5, migration `when`.** Is "`when` = previous + 1" meant to apply only to the frozen Drizzle journal? This review assumes yes, per ADR-066, and drops the invented `journal.ts` files.
4. **P11 OQ-11a, `allowTrashTtl: true`.** This automatically removes media bytes after 60 days in Trash plus 30 days of grace. It is harmless today, because STOP 6 keeps media report-only and the Jini default becomes `false`. Ask it as its own question before media unlink ever goes live.
5. **P11 chat `delete-selected`.** Is `confirm: true` plus the server's per-id recheck enough, or must it go through the full preview token? Default: `confirm: true` plus the recheck.

Accepted defaults, needing no owner action:
- **P3:** Q1–Q7, matching INDEX (sites with enabled routines start on open, no BYOK, approval pending at quit becomes Interrupted).
- **P4:** all of them, decided 11-21.
- **P5:** Q4 kept as written; Q5 accepted with a release note and no freeze.
- **P11:** `scheduledDryRun: true`, tolerance 1.25 with periodic ×2, `requireOtherInstancesClosed: true`, 90-day terminal retention, `allowBulkPinned: false`, share links default to Never with `showExpired: true`, and revisions date-only.

## Notes for the fix pass

- **INDEX corrections:**
  - `INDEX.md:48-51`: the P4-T4 rows are stale; mark them LANDED as Tovu `04d030b5a`.
  - The `INDEX.md` header still says `ADMIN_PANELS` is at `:1307`; it is at `A/panels.tsx:1313`.
- **Pins computed by the P5 reviewer** (for `site_import_migrations`): `483c2b21…549fb` if only the DDL string is hashed, `b17023c3…b8edb` if the whole file is hashed. Opus must re-derive both before relying on them.
