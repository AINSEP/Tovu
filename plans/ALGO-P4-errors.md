DESIGN COMPLETE
# ALGO-P4 · Errors — algorithm design

**Run:** unattended cloud design run 2026-11-23 (Opus high), Software Architect skill loaded (`AI-Dev-Shop/agents/software-architect/skills.md`). Drafted by a read-only subagent, merged by the coordinator. Plan: `plans/P4-errors-next.md`; check applied: `reviews/check-P3-P4-P5.md`. Design only — no production code, builds or tests.

**Bases and verification.** Tovu `origin/integ/merge-13-2026-11-22` = `f7185f153`; Jini `origin/integ/merge-14-2026-11-22` = `4902a6a1`. Every `path:line` below was re-read on those refs with `git show <ref>:<path>`. Unmerged heads screened with `git diff --stat $(merge-base)..<head>` over every file this design touches: Jini `ex5-fnd-routes-jini` (edits `J/http-kit/src/adapter.ts`, `J/core/src/contracts/server/json-route.ts`), `ex5-fnd-inject-jini` (edits `J/daemon/src/tool-recovery/diagnostics.ts` only); Tovu `ex5-fnd-inject-tovu` / `ex5-fnd-seams-tovu` / `ex5-fnd-kit-tovu` (one-line import moves in `admin-failure.ts`, `tool-recovery-preset.ts`, `process-root-parity.test.ts`, `admin-failure-channel.ts`), `ex4-deploy-tovu` / `ex4-settings-tovu` / `ex5-collections-tovu` (small `app.ts` edits). No head moves a file this design edits; destination paths = base paths. **`ex2-holds-tovu` / commit `46fc4f901`** was absent from the subagent's clone; the coordinator fetched it afterwards and checked `admin-failure.ts:71-99` there: it classifies `DatabaseDiskSpaceError` before minting/reporting (507, no id) and reports with the correlated body id (`failure.errorId ?? errorId`) — the same order T2 step 3 designs (classify → record → reply). T2 should rebase on that commit rather than re-implement C115. `W/`=Tovu `apps/website/src/`, `A/`=`apps/admin/src/`, `J/`=Jini `packages/`.

## Summary

| Step | Operations designed | Invariants | Open owner questions |
|---|---|---|---|
| J1 | changeset artifact; `refusalError` split into `refusalMessage` + `refusalError` | I1.1–I1.3 | none |
| J2 | route success, returned refusal (parse/handle/413), returned INTERNAL_ERROR, thrown refusal, ClientFacingError, `ports.onError` (+ throwing onError), thrown incident, disconnect (returned + thrown abort), reporter/tracker port failures, Express headers-sent; compat vs reporter mode; `runOperation` fixes | I2.1–I2.10 | Q-J2a node-bridge sink, Q-J2b audience, Q-J2c thrown abort, Q-J2d stream-span |
| J3 | sink retirement per package; reporter-backed `ReportRouteInternalError` becomes the only binding | I3.1–I3.4 | Q-J3a release grouping |
| J4 | daemon route reports; tool throw, tool failed result, timed-out, validation refusal, nested failure, delegated-route describe; `toolFailures` sink removal; observability disabled | I4.1–I4.8 | Q-J4a cancelled id |
| J5 | IPC handler success, throw, refusal, socket write failure, legacy default; trace logger injection; method label | I5.1–I5.5 | Q-J5a refusal wire code |
| T1 | shutdown ordering with `afterSettled` | I6.1–I6.3 | none |
| T2 | reader compat; one reporter per composition; `reportServerFailure` reporter mode; C115 early 507; Jini route host rebinding | I7.1–I7.7 | Q-T2a public/daemon reporter placement, Q-T2b tracker adapter redaction |
| T3 | tool stack reporter binding on server, daemon and BYOK paths | I8.1–I8.4 | none |
| T4 | LANDED — regression reconcile only | I9.1–I9.2 | none |
| T5 | proven-duplicate pair removal | I10.1–I10.3 | none |

## Corrections applied from `reviews/check-P3-P4-P5.md` (P4 rows)

1. **J1**: keep `own-message` suppression; reduce complexity by *splitting* message selection (not by deleting `:163`, which the plan's "fold into `match.message ?? fallback.message`" would turn into a disclosure because `ErrorMatch.message` is documented at `J/core/src/errors/catalog.ts:17-19` as the error's own message in `own-message` mode). Add a canary-catalog test.
2. **J2**: wrap *request execution* (not the failure branch) in `J/http-kit/src/adapter.ts:39-81` and `J/core/src/contracts/server/json-route.ts:188-194`; config/binding at `J/server/src/create-local-node-daemon.ts:124,375,506`; classify returned refusals explicitly because `runOperation` (`reporter.ts:222-239`) marks any resolved value `completed`. Pin returned/thrown refusal, `onError` precedence, 413, disconnect, success, one span with the pattern. Coordinate `ex5-fnd-routes-jini` (adds `onReturnedError`).
3. **J3**: keep the compatibility path until J4 and the Tovu replacements are ready; retire sinks per package in one breaking release; Tovu callback consumers `W/server/runtime/composition/__tests__/jini-routes.unit.test.ts:132`, `W/server/inbound/assistant/__tests__/agent-daemon-server.typed-tools.integration.test.ts:135` (also found: `W/assistant/__tests__/delegated-tool-error-disclosure.test.ts:54`, `W/assistant/__tests__/tool-executor-stack.failure-redaction.test.ts:159`, `W/features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts:311`).
4. **J4**: anchors `model-proxy.ts:398-442`, `runs.ts:84-92`, `terminals.ts:92-100`, `tool-recovery/observability.ts:80-111`, `stack.ts:57-95`, `redaction.ts:55,119-134,204-226`. One report with observability disabled; one id through SSE/model/audit; zero reports for input refusals; `errorId` in `record`'s second object; hand T3 the replacement port; queue P10-O2 counters in the same decorator.
5. **J5**: setup `json-ipc.ts:163-178`, failure path `:356-394`; inject logger + reporter at setup, suppress the legacy write on the reporter path, keep `HANDLER_ERROR`, bounded method label (handler gets `unknown` at `:366`).
6. **T1**: READY; preserve disposal → publication settlement → owned pointer removal incl. second signal. (The check's "base already consumes `afterSettled`" is true for other files — `W/assistant/site/visitor-tool-budgets.ts:4` — but **not** for `agent-daemon-server.ts`, whose `:48` still reads `await registryPublication.catch(() => undefined)`.)
7. **T2**: carry C115; one reporter **per owning server/daemon composition** (not only `app.ts:419`, which is `/api/admin` middleware); preserve reader compat; consume J2/J3/J4 together.
8. **T3**: bind along server and daemon executor paths incl. `W/server/inbound/assistant/agent-daemon-scope-tools.ts:120`; keep standalone redaction and delegated disclosure (`tool-recovery-preset.ts:90-98`) working; parity with tracker on/off.
9. **T4**: LANDED (`04d030b5a9`); design regression reconcile only.
10. **T5**: replace broad `tracker?.error` deletion by a proven-duplicate list with one named test per pair.
11. **All**: add a **Wiring** section (P12 ADR-071) — see "Wiring doc" at the end.

## Cross-cutting model (referenced by every step as **CM-n**)

**CM-1 · Owners.** `@jini-ai/core` owns `ErrorReporter`, `createErrorReporter`, `runOperation`, `mintToolErrorId`, the catalog, and the new generic port bundle `RouteErrorPorts` (below). `@jini-ai/http-kit` owns the Express adapter and the reporter-backed `ReportRouteInternalError` implementation. `@jini-ai/server` owns the preset config field. `@jini-ai/daemon` owns tool decorators and route registrars. `@jini-ai/sidecar` owns IPC. Tovu owns its one-reporter-per-composition factory, catalog, redaction policy and the `AdminFailurePorts` extension. No P4 state is persisted: everything is in-memory plus log/tracker records.

**CM-2 · Verified reporter facts** (`J/core/src/errors/reporter.ts`):
- `ErrorReporter.describe(required{error,step,scope,fallback,operation,tracker}, optional{errorId?,audience?,approvedCause?,exactSecrets?})` (`:70`). Refusal first (`:191`; `ClientFacingError` at `:175`, catalog match at `:179`). If `optional.errorId` is given it **does not record** (`:193-196`: trusts the caller who already recorded). Else `recordIncident` mints (`:135`), writes one host record (`:147`), one tracker report (`:148`). Reply `{code:'INTERNAL_ERROR', message:'<fallback.message> <fallback.action> (error <id>)', requestId:<id>}`, status 500 (`:201-202`).
- `record(required{error,step,operation,tracker?}, optional{errorId?,level?,exactSecrets?,tracker?:'report'|'skip'})` (`:72`) **always writes** (with `errorId` it writes under that id).
- Port failures are contained by `attempt` (`:89-91`); failed id port → `UNAVAILABLE_ERROR_ID` (`:76`).
- `runOperation` (`:222-239`): `trackOperation` → `tracker.run(work)` → `end({outcome:'completed'})` → `{ok:true}`; catch → `describe` → `end(refused|failed)`. **Defects found:** (a) `tracker.end` on the success path is inside the `try` (`:231`), so a throwing `end` turns a success into an incident report; (b) a throwing `trackOperation` (`:228`) rejects the whole operation unreported; (c) a resolved value is always `completed`.
- `record` has **no `attributes`** parameter, yet the plan puts route fields (`runId`) "into attributes" (J3). `ErrorReport.context.attributes` exists on the port (`J/core/src/contracts/observability.ts:60`), so the gap is only in the reporter signature.

**CM-3 · Core changes shared by J2–J5 (one core changeset `core-route-operation.md`, minor, lands in J2):**
1. `RecordFailureOptions.attributes?: OperationAttributes` and `DescribeFailureOptions.attributes?` → forwarded into `reportToTracker`'s `context.attributes` and into the host record `meta.attributes`. Values pass `fixedAttribute()` (regex `^[\w.:/-]{1,128}$`, else dropped) so a caller cannot smuggle user text.
2. **Per-reporter dedupe mark.** Inside `createErrorReporter` a closure `WeakMap<object, string> reported`. `recordIncident`: `if (isObject(error) && reported.has(error)) return {errorId: reported.get(error)}` *before* minting (no second write); after writing, `reported.set(error, errorId)`. `describeFailure`: after the refusal check, `prior = optional.errorId ?? reported.get(error)`; if `prior` → no record. Primitives are never marked (limit, documented). Per-reporter, not module-global: no hidden process state, tests isolate by building a reporter. Purpose: a failure that crosses two boundaries in one process (tool → route, handler → IPC) keeps one id and one report.
3. `runOperation` gains two optional fields in its **required** object (two-object API kept): `classify?: (value: T) => OperationVerdict` where `OperationVerdict = { outcome: 'completed'|'refused'|'failed'|'cancelled'; failed: boolean; attributes?: OperationAttributes }` (default `{completed,false}`), and `settle?: (error: unknown) => OperationVerdict | undefined` (a thrown value the caller classifies *without* a report — used only for client disconnect). New result arm `{ ok: true; value: T; verdict }`.
4. `runOperation` body rewritten as three helpers (each ≤ 25 lines, complexity ≤ 4): `startOperation` (`attempt(() => trackOperation(...), NOOP_OPERATION_TRACKER)`), `settleThrown` (`settle?.(error) ?? describe(...)`), `endOnce` (`attempt(() => tracker.end(verdict))`). `end` is called **outside** the try, exactly once. `NOOP_OPERATION_TRACKER = { run: (fn) => fn(), end: () => {} }` exported from `reporter.ts` (needed by J4/J5 for observability-disabled hosts).
5. `ClientFacingError` moves to `J/core/src/contracts/server/client-facing-error.ts` so `json-route.ts` can runtime-import `runOperation` without a cycle (`reporter.ts:11` imports `ClientFacingError` from `json-route.ts`; `scripts/runtime-cycles.depcruise.mjs` exists). Importers are updated to the new owner file and the `contracts/server` barrel exports it from there (no shell left in `json-route.ts`). STOP-check: run the depcruise cycle rule before and after.
6. `RouteErrorPorts` (core, in `contracts/server/json-route.ts`): `{ readonly reporter: ErrorReporter; readonly observability: Pick<ObservabilityPort, 'trackOperation'> }`, added as `RouteHostContext.errors?: RouteErrorPorts` (`json-route.ts:69-75`). Because `RouteHostContext` already flows to the Express adapter (`adapter.ts:37`), the fetch route (`json-route.ts:179`), the daemon route table (`J/daemon/src/http/route-table.ts:56`) and the preset extensions (`create-local-node-daemon.ts:375`), **one field reaches every HTTP boundary** with no new parameter threading.

**CM-4 · The shared operation flow (order of effects is normative).**
```
boundary(request):
  1 tracker  = startOperation(observability, name, fixedAttrs)          # span start (or NOOP)
  2 try   value = await tracker.run(work)                                # async context only around work
       verdict = classify(value)                                         # returned refusal → refused, no id
  3 catch error:
       verdict = settle(error)                                           # disconnect → cancelled, no id
             ?? describe(error, tracker)                                 # refusal → refused, no id
                                                                         # incident → mint id → host log → tracker.reportError(traceIds)
  4 endOnce(tracker, verdict + {status})                                 # span end, exactly once
  5 write reply (core: return Response; Express/IPC: write)              # id appears in reply words + requestId
```
Effects inside 3 for an incident are, in order: dedupe check → mint id (`ids.newId`) → clock → redact → **host record** (`logger.error`) → **tracker report** (`observability.reportError` with `incidentId`, `trace = tracker.traceIds()`) → return id. The reply is written last, so a crash after step 3 leaves the record and loses only the reply.

**CM-5 · Mode state machine (per package, J2→J3 window).**
```
           host passes errors                    J3/J4 release deletes legacy
LEGACY ──────────────────────────► REPORTER ───────────────────────────────► REPORTER-ONLY
(onInternalError / ToolFailureRecord /           (reporter path; legacy sink        (errors required where an incident
 console line, UUID/12-hex ids)                  options ignored, never both)        can occur; legacy types removed)
```
Mode is chosen **per composition at mount time** (`RouteHostContext.errors` present or not), never per request, so two requests of one host can never take different paths. In REPORTER mode a legacy sink option that is still passed is ignored (not called), which is what makes "never both" (I2.6) hold during the window.

**CM-6 · Operation span states.** `started → completed | refused | failed | cancelled`; terminal states are absorbing; `endOnce` is the only transition writer. `failed` ⇔ an incident id exists for this operation *or* a producer inside it returned an `INTERNAL_ERROR` it reported itself.

**CM-7 · Fallback words (plain language).** HTTP: `{ message: 'The server could not finish this request.', action: 'Check whether your change was saved, then try again. If it keeps failing, report the error ID.' }` (current text at `adapter.ts:144` split into message/action). IPC: `{ message: 'The sidecar could not finish this request.', action: 'Try again, and report the error ID if it keeps failing.' }` (`json-ipc.ts:390`). Tool: unchanged `Error <ID>: <redacted reason>` (`redaction.ts:224`).

**CM-8 · Must-not-import (all steps).** `@jini-ai/core` imports no Express, no `node:*`, no vendor SDK; `json-route.ts` stays fetch-`Request`/`Response` only. Daemon/sidecar import `@jini-ai/core` ports only, never `@jini-ai/diagnostics`. Tovu product types (`AdminFailurePorts`, catalog) live in Tovu or `@tovu/contracts`; Jini never imports Tovu. No new re-export shells. Every new function ≤ 80 lines, complexity ≤ 10; helper names are given per step.

---
## P4-J1 · Jini · core changeset + `refusalError` split

**1 Data model.** New file `.changeset/core-error-reporter-contract.md` (core `major`), text copied verbatim from Tovu `inputs/r62t-left.md` L6 (`:44-53+`; the block begins `"@jini-ai/core": major` and names `ErrorReporterPorts.observability`, removed `IncidentTrackerReport` / `createRecordingTracker`, `runOperation`). No type changes. `refusalError` (`J/core/src/errors/reporter.ts:157-169`) keeps its signature.

**2 Algorithm.** Split message choice out of `refusalError`:
```
refusalMessage({match, fallback, audience}) -> string | 'sentence'
  if match.sentence?.audience == 'authorized' and audience != 'authorized': return fallback.message
  switch match.mode:
    'own-message': return fallback.message          # never match.message (catalog.ts:17-19 says it is the error's own text)
    'fixed':       return match.message ?? fallback.message
    'sentence':    return match.sentence ? 'sentence' : fallback.message
refusalError(...)
  base = {code, retryable?}
  m = refusalMessage(...)
  if m != 'sentence': return {...base, message: m}
  params = redactedParams(...); message = interpolate(...)
  return params empty ? {...base, message} : {...base, message, details:{params}}
```
Use a tagged return (`{kind:'text',message}|{kind:'sentence',sentence}`) rather than the string sentinel in code. Keep the why-comment at `:157` on `refusalError`; add one on the `own-message` arm citing `catalog.ts:17-19`. Complexity: `refusalMessage` 5, `refusalError` 3.

**3 State machine.** None.

**4 Concurrency/crash.** Pure functions; N/A.

**5 Failure modes.** A catalog (injectable, `catalog.ts:29-41`) may return `mode:'own-message'` *with* `message` set to the raw error text → must still show `fallback.message` (disclosure guard). Unknown future `mode` → treat as `fixed` (falls to `match.message ?? fallback`)? **No**: make the switch exhaustive with a `never` check so typecheck fails on a new mode.

**6 Invariants.**
- I1.1 `own-message` never discloses `match.message`. Test (extend `J/core/src/errors/__tests__/reporter.test.ts:243-283` block): `an own-message match carrying a canary message answers the fallback words`. **Mutation:** return `match.message ?? fallback.message` for `own-message` → red.
- I1.2 Authorized-only sentence words stay hidden from non-authorized audiences — existing test at `:278` ("words a sentence reserves for authorised callers…") stays green.
- I1.3 The changeset covers the breaking core API. Artifact check: `pnpm api:check` reports core "breaking, covered by changeset"; delete the file → red.
- `check:complexity` no longer lists `refusalError (11)`.

**7 Wiring.** None (internal). **8 OWNER-Q.** None.

---
## P4-J2 · Jini · HTTP route boundary + one `http.route` span

**1 Data model.**
- Core (CM-3): `RouteErrorPorts`, `RouteHostContext.errors?`, `runOperation` `classify`/`settle`, `record`/`describe` `attributes`, per-reporter dedupe, `NOOP_OPERATION_TRACKER`, `ClientFacingError` file move. Changeset `core-route-operation.md` (minor).
- Server: `CreateLocalNodeDaemonConfig.errors?: RouteErrorPorts` (`create-local-node-daemon.ts:124`); at `:506` `adapter = { originPolicy, ...(config.errors ? { errors: config.errors } : {}) }`; `:375` and the kernel routes already receive `adapter`. Changeset `@jini-ai/server` minor.
- http-kit: `createReporterRouteInternalError({ reporter }): ReportRouteInternalError` (new file `J/http-kit/src/reporter-internal-error.ts`, reporter mode of CM-5). `presetRouteHost` (`J/server/src/route-host.ts:34-48`) binds `reportInternalError: context.errors ? createReporterRouteInternalError({ reporter: context.errors.reporter }) : reportRouteInternalError`. Changeset http-kit minor.
- Daemon: none (route-table `:56` already passes `host.context`).
- Attributes (fixed only): `http.method` (upper-case verb from the **spec**), `http.route` (= `spec.path`, the registered pattern), `http.status_code` on end. Never `request.url`, query, params.

**2 Algorithm.**

*2a Core fetch route* (`json-route.ts:188-194` `answerJsonRoute`, reporter mode). `errors = host?.errors`; if absent → today's code unchanged (LEGACY).
```
answerJsonRoute(call, {host}):                         # ≤ 20 lines
  if !host?.errors: return legacyAnswer(call, {host})  # = today's try/catch, renamed
  run = await runOperation({
    deps: host.errors, operation:'http.route', scope:'http',
    step: `Handle ${METHOD} ${spec.path}`, fallback: HTTP_FALLBACK,
    attributes: {'http.method': METHOD, 'http.route': spec.path},
    work: () => tracedAnswer(call, {host}),            # returns Tagged {response, verdict}
    classify: (t) => t.verdict,
    settle: (e) => disconnectVerdict(call.request, e)  # Q-J2c
  })
  return run.ok ? run.value.response : failureResponse(run.failure)
```
`tracedAnswer` (≤ 30 lines):
```
  try: tagged = await routeAnswerTagged(call, {host})        # routeAnswer (:235-248) returning {response, verdict}
  catch error:
    if !spec.ports?.onError: throw error                     # → runOperation catch → describe
    return hostPolicyAnswer(call, error)                     # onError precedence (unchanged order: before ClientFacingError)
```
`routeAnswerTagged` keeps `routeAnswer`'s order exactly (raw input → workspace → origin → authenticate → parse → handle → `finalAnswer`) and tags each exit with `verdictFor`:
- raw input refusal (incl. **413** `PAYLOAD_TOO_LARGE`, `request-body.ts:12`; 415), origin 403, parse refusal, handle `err(...)` → `verdictFor(apiError)`;
- success → `{completed,false}`;
- `finalAnswer` with `request.signal.aborted` (`:256`) → `{cancelled,false,status:499}`.
```
verdictFor(apiError, status):
  if apiError.code == 'INTERNAL_ERROR': return {outcome:'failed', failed:true}   # producer reported it (in-route reportInternalError)
  return {outcome:'refused', failed:false}
```
`hostPolicyAnswer` (≤ 15 lines): `try { r = await onError({error, request}); return {response:r, verdict: r.status >= 500 ? failed : refused} } catch (policyError) { reporter.record({error: policyError, step:'Answer with host error policy', operation:'http.route'}); throw error }` — the **original** error then flows to `describe`, so the reply carries the original's id; the policy failure is a second, separate incident (distinct failure, distinct id).
`failureResponse(failure)` = `jsonResponse({status: failure.status, body: {error: failure.error}})` — `failure.error.requestId` is the ERR id; a refusal (ClientFacingError/catalog) has no id.

*2b Express adapter* (`adapter.ts:39-81`, reporter mode when `adapter?.errors`). Same flow; `work` = the existing body (`:58-75`) refactored into `serveExpressRoute(...)` returning a verdict instead of writing on refusal paths; writes stay in `sendRouteResult`/`sendApiError`. Order per CM-4: classify → `endOnce` → write. Because Express writes happen inside `work` today, restructure so `work` returns `{write: () => void, verdict}` and the write is executed **after** `runOperation` returns (keeps "end before write" uniform). `allowRouteOrigin` writes the 403 itself (`origin.ts`) → wrap: it returns a verdict `refused` and its write closure. `onError` (Express shape writes to `res`) → verdict from `res.statusCode` after it returns. With `ex5-fnd-routes-jini` (`sendReturnedFailure` + `onReturnedError`, phase `parse|handle`): classification happens **before** calling `sendReturnedFailure`; the host port only shapes the wire. Express 413 is produced upstream by `J/http-kit/src/middleware.ts:30` before the route runs → no `http.route` span (the host's request tracker owns it); documented, pinned by a test that asserts zero `trackOperation` calls for an oversized body.
Thrown, no onError: `runOperation` → `describe` → `sendApiError({status: failure.status, error: failure.error})`. If `res.headersSent` at that point (a policy or handler wrote partially) → no second write; `res.destroy?.()`; the incident is still recorded (`kind:'incident'`).

*2c Reporter-backed `ReportRouteInternalError`* (http-kit, used by in-route callers in daemon/Tovu):
```
createReporterRouteInternalError({reporter}) -> (required{report,logSource,message}, _optional) =>
  {errorId} = reporter.record({error: report.error, step: logSource, operation:'http.route'},
                              {attributes: fixedReportFields(report)})   # runId, batchId, source, provider, operation
  return {code:'INTERNAL_ERROR', message:`${message} (error ${errorId})`, requestId: errorId}
```
`_optional.onInternalError` is **ignored** (CM-5). `fixedReportFields` copies only string fields from an allow-list and passes them through `fixedAttribute` (CM-3.1).

**3 State machine.** CM-5 (LEGACY/REPORTER chosen at mount) × CM-6 (per request). Per request: `started → completed` (2xx), `→ refused` (any returned non-INTERNAL error, thrown ClientFacingError/catalog refusal, onError <500), `→ failed` (incident, returned INTERNAL_ERROR, onError ≥500), `→ cancelled` (aborted before answer).

**4 Concurrency + crash safety.**
- One id per failure: the boundary never mints; only `recordIncident` mints, and the dedupe mark makes a second boundary in-process reuse it (an in-route `reportInternalError` then a rethrow of the same error object → one id).
- Exactly once span end: `endOnce` is outside the try; the success path can no longer be converted into an incident by a throwing `end` (CM-2 defect a).
- Async context: only `work` runs inside `tracker.run`; `describe`/`end` run outside it with the explicit tracker, so nothing scheduled by the reporter (a `reportError` promise) inherits the request's context beyond its lifetime.
- Concurrent requests: each has its own tracker; the reporter is stateless except the WeakMap (keys are per-request error objects; GC frees them).
- Disconnect: `request.signal` aborted → `cancelled`, 499, no write, no report. A handler that *throws* after abort: see Q-J2c.
- Process dies mid-response: host record precedes reply (CM-4); tracker report may be lost (async). No partial persisted state exists.

**5 Failure modes.**
- `trackOperation` throws → NOOP tracker, request proceeds, no span (CM-3.4).
- `tracker.end` throws → swallowed by `attempt`; reply unchanged.
- `describe` is contractually non-throwing; defend anyway: `safeDescribe` wraps it and on a throw returns `{kind:'incident', status:500, error:{code:'INTERNAL_ERROR', message: <fallback words> + ' (error ERR-0000-0000-0000-0000)', requestId: UNAVAILABLE_ERROR_ID}}` and writes one fixed stderr line naming only the route pattern. The original is never masked by the reporter's failure, the request is always answered.
- Catalog returns `own-message` text → J1 guard.
- Redaction: host record = redacted `describeThrownValue` (`reporter.ts:139`); tracker gets the raw error; the host's tracker adapter must blank secrets (Tovu: Q-T2b).
- Plain words: every 500 reads `The server could not finish this request. Check whether your change was saved, then try again. If it keeps failing, report the error ID. (error ERR-…)`.

**6 Invariants + tests** (files: `J/core/src/contracts/server/__tests__/json-route.test.ts`, `J/http-kit/src/__tests__/adapter.test.ts`, `adapter-pins.test.ts`, `J/core/src/errors/__tests__/reporter.test.ts`). Fakes: counting reporter over `createErrorReporter` with a recording logger + recording observability; recording `trackOperation`.
- I2.1 `a throwing route with a reporter returns one ERR- id that matches the single host record and the single tracker report` — **mutation:** mint a second id in the adapter / call `describe` twice → red.
- I2.2 `one http.route operation per request, attribute http.route is the pattern` — request `/runs/abc?x=1` against `/runs/:id` asserts `'/runs/:id'`. **Mutation:** use `request.url`/`req.originalUrl` → red.
- I2.3 `a returned refusal ends the operation as refused with no report` (parse error, handle `err`, 413 via `maxBodyBytes`) — **mutation:** drop `classify` (default completed) → red.
- I2.4 `a thrown ClientFacingError is refused at its own status with no id`.
- I2.5 `ports.onError answers before the reporter and the reporter records nothing for it`; `a throwing onError still answers with the original failure's id and records the policy failure separately`.
- I2.6 `without errors the legacy path still answers with requestId and calls onInternalError`; `with errors, a passed onInternalError is never called` — **mutation:** call both → red.
- I2.7 `a disconnected client gets no write, the operation ends cancelled, nothing is reported`.
- I2.8 `a tracker whose end throws leaves a successful request answered 200 with zero reports` (runOperation) — **mutation:** move `end` back inside the try → red.
- I2.9 `a route that returns the reporter-backed INTERNAL_ERROR ends failed with exactly one report` — **mutation:** report again in `verdictFor` → red.
- I2.10 `an oversized Express body never starts an http.route operation`.

**7 Wiring.** Core defines `RouteErrorPorts`; the server preset takes `errors` and puts it on the one `RouteHostContext` (`:506`); the daemon route table (`route-table.ts:56`) and extensions (`:375`) inherit it; `presetRouteHost` binds the reporter-backed `reportInternalError`. Tovu's `daemonRouteHost` (`W/server/runtime/composition/jini-routes.ts:62-69`) gets the same in T2. Must-not: no Express import in `json-route.ts`; no `@jini-ai/diagnostics` import anywhere in core/http-kit/server for this; route specs stay `defineJsonRoute` data. Coordinate: land on top of `ex5-fnd-routes-jini` (or rebase it) — both edit `adapter.ts` `mountJsonRoute` and `json-route.ts` `makeAuthorize`; P9 RT-K1-0 first per the check.
Function splits: `answerJsonRoute` (≤ 20), `legacyAnswer` (today's body), `tracedAnswer`, `routeAnswerTagged` (≤ 30, complexity ≤ 8), `verdictFor`, `hostPolicyAnswer`, `failureResponse`, `disconnectVerdict`; Express: `mountJsonRoute` callback (≤ 25), `serveExpressRoute` (≤ 40), `expressVerdict`, `writeFailure`.

**8 OWNER-Q.**
- **Q-J2a** node-bridge sink: `J/http-kit/src/node-bridge.ts:285-314,338-356,408-414` mints a third id shape (12-hex `reference`) and Tovu mounts every Jini list through it (`W/server/runtime/composition/jini-routes.ts:33`). In reporter mode it only fires when `route.handler` itself rejects (a throwing `onError` in legacy mode, a reporter breach) or a response write fails after headers. *Recommend:* add `NodeDispatcherOptions.reporter?: Pick<ErrorReporter,'record'>` in J2: `onUnhandledError` becomes `reporter.record({error, step:'Write response', operation:'http.route'})` and the 500 text carries the ERR id; otherwise ERR, UUID and 12-hex ids coexist after P4.
- **Q-J2b** audience: core routes default `describe` to `'anonymous'` (no Copy-details). *Recommend:* keep anonymous in P4; a later `RouteErrorPorts.audienceFor?({context})` after authentication.
- **Q-J2c** thrown abort: today a handler that throws `AbortError` after disconnect goes to `exceptionAnswer` and is reported. *Recommend:* `disconnectVerdict` = `request.signal.aborted && isAbortLike(error)` → `cancelled`, no report; any other error after abort is still an incident.
- **Q-J2d** streamed answers (SSE, model proxy): the span ends when the stream `Response` is returned. *Recommend:* leave as is in P4 (in-stream failures are reported with their own id, J4); span-to-stream-close is P10-O2.

---
## P4-J3 · Jini · retire http-kit/core `onInternalError` sinks (after J4 and the Tovu replacements)

**1 Data model.** Removals (one breaking release, grouped with J4 per the check): core `RouteHostContext.onInternalError` (`json-route.ts:74`), `RouteHostInternalErrorContext` (`:48-57`), the `optional.onInternalError` arm of `ReportRouteInternalError` (`:63-66`), legacy `exceptionAnswer` SEC-005 branch (`:260-277`); http-kit `reportRouteInternalError` + `deliverRouteInternalError` + `logRouteInternalError` + `RouteInternalErrorContext` + `RouteInternalErrorSink` (`internal-error.ts:1-66`), the legacy branch of `sendRouteException` (`adapter.ts:114-147`). `RouteHostContext.errors` becomes **required** for any host that mounts a JSON route; `ReportRouteInternalError` keeps its shape `(required{report,logSource,message}, _optional?: Record<string,never>) => ServerApiError` so the 75 daemon call sites only lose their `{ onInternalError }` argument. Verified counts (non-test): core 6, daemon 75, http-kit 11, server 0, sidecar 0 = 92. Changesets: `@jini-ai/core` major (add to the core release notes, per the check), `@jini-ai/http-kit` major, `@jini-ai/server` minor (config `errors` becomes required? → **major** if required; see Q-J3a).

**2 Algorithm (ordered migration; each line is one commit).**
1. Gate: grep Tovu (`git grep -n 'onInternalError\|reportRouteInternalError' origin/<tovu-base> -- apps packages`) — must list only files that T2/T3 replace in the same release window (the five tests in Correction 3 + `jini-routes.ts:11,65`). Non-empty unexpected list → STOP.
2. http-kit: delete `internal-error.ts` legacy exports; `presetRouteHost` and Tovu `daemonRouteHost` bind `createReporterRouteInternalError` unconditionally.
3. core: delete `onInternalError` fields; `answerJsonRoute` loses `legacyAnswer`; `jsonRoute`'s `reportInternalError` argument stays (used by in-route callers through `DaemonRouteHost`).
4. Route-specific fields previously carried by the sink context (`runId`, `batchId`, `source`, `provider`) travel as `attributes` (CM-3.1) via `fixedReportFields`.
5. Update pins that asserted the callback; add `route-host serves an ERR- id from the injected reporter` (`J/server/src/__tests__/route-host.test.ts`).

**3 State machine.** CM-5 moves http-kit/core from REPORTER to REPORTER-ONLY. No mixed state: J3 must not merge before J4 (daemon still passes `onInternalError` through the same type).

**4 Concurrency/crash.** No runtime change beyond J2; deletion only removes the LEGACY branch.

**5 Failure modes.** A host that never passes `errors` now fails typecheck (intended: "no optional sink, so an incident cannot be dropped", `reporter.ts:7-8`). A host built against the old type at runtime (JS consumer) → `jsonRoute` asserts `host?.errors` at mount and throws a plain-words setup error: `Pass errors: { reporter, observability } when mounting JSON routes.`

**6 Invariants.**
- I3.1 `route-host serves an ERR- id from the injected reporter` (id matches recording logger).
- I3.2 `a route incident writes exactly one host record` — **mutation:** keep a second log sink (`console.error` default line) → record count 2 → red.
- I3.3 `pnpm api:check` lists http-kit major + core major covered by changesets.
- I3.4 `git grep -c onInternalError -- packages/{core,http-kit}/src ':!**/__tests__/**'` = 0 (guard script assertion, not a test).

**7 Wiring.** After J3 the only HTTP incident path is `RouteHostContext.errors` (CM-3.6). **8 OWNER-Q.** **Q-J3a** make `CreateLocalNodeDaemonConfig.errors` required (server major) or default-build a reporter in the preset from Node ports (server minor)? *Recommend:* required — a default reporter would need a default catalog/version/logger the preset cannot know, and it would hide a missing host binding.

---
## P4-J4 · Jini · daemon routes + tool boundary

**1 Data model.**
- Daemon route registrars: drop the `{ onInternalError }` second argument at every `host.reportInternalError(...)` / `deps.reportInternalError(...)` call (`model-proxy.ts:402`, `runs.ts:91`, `terminals.ts:99`, `connectors.ts:164`, `db-ops.ts:239`, `attachments.ts:219`, `attachment-lookup-routes.ts:77`, …; 75 refs) and remove `onInternalError` from each `*HttpDeps` (`InternalErrorSink` type at `model-proxy.ts:400` etc.).
- Tool boundary (replacement port handed to T3): `AssistantToolExecutorDeps` (`stack.ts:57-67`) → remove `toolFailures: RedactedToolFailuresDeps`; add **required** `reporter: Pick<ErrorReporter,'record'>` and `toolFailures: { mintErrorId; redactSecretShapes }` (no `onFailure`). Delete `ToolFailureRecord` (`redaction.ts:158-166`) and `safeOnFailure` (`:182-188`). `withToolCallObservability({ inner, reporter, observability? }, { isRegisteredTool, observabilityEnabled })`. `DelegatedToolsInternalErrorContext` (`J/daemon/src/http/delegated-tools.ts:84-96`) gains `errorId?: string` (from `readToolErrorId(result)`). `isRedactedToolFailure` (`redaction.ts:70-72`) tightened to `status === 'failed' && errorId !== undefined`. Changeset `@jini-ai/daemon` major.
- Tool attributes (fixed): `tool.id` (label via `toolCallLabel`, `observability.ts:42-45`), `agent.run.id`, `user.id` (pseudonymous), `tool.error_kind`, `tool.execution_id`, `tool.redactions` (number).

**2 Algorithm.**

*2a Decorator* — rename stays `withToolCallObservability` (`observability.ts:80`), installed by `stack.ts` **whenever** (always, since `reporter` is required), not only when observability is non-noop (`stack.ts:85-90` today skips it → the bypass the check names).
```
execute(call):                                           # ≤ 25 lines
  observed = observabilityPresentAndEnabled()            # isNoop / observabilityEnabled()
  tracker  = observed ? startOperation(obs,'tool.call',attrs) : NOOP_OPERATION_TRACKER
  try result = await tracker.run(() => inner.execute(call, options))
  catch error: settleThrownToolCall(...); throw error    # rethrow unchanged
  return settleToolResult(...)

settleThrownToolCall({error, tracker, attrs}):           # ≤ 15
  kind = error instanceof ToolInputError ? 'validation' : 'internal'
  if kind == 'internal': reporter.record({error, step:'Run tool', operation:'tool.call', tracker}, {attributes: attrs})
                         # marks error → a later route describe/record reuses the id (CM-3.2)
  endOnce(tracker, {outcome:'threw', failed:true, attributes:{'tool.error_kind':kind}})
  metrics(observed, failed=true)                         # P10-O2 counters live here

settleToolResult({result, tracker, attrs}):              # ≤ 25
  kind = errorKindOf(result)                              # observability.ts:57-59
  if result.status == 'failed' and kind == 'internal':
      reporter.record({error: new ToolExecutionFailure(result.error), step:'Run tool', operation:'tool.call', tracker},
                      {errorId: readToolErrorId({result}), attributes})          # same id as model text + audit
  elif result.status == 'timed-out':
      {errorId} = reporter.record({error: new ToolExecutionFailure(result.error ?? 'timed-out'), ...tracker}, {attributes})
      result = {...result, errorId}                       # stamped so the route reuses it (Q: field name kept errorId)
  endOnce(tracker, {outcome: result.status, failed: FAILED_STATUSES.has(status), attributes?})
  metrics(...); return result
```
`validation` failures and `denied`/`cancelled` statuses: **no** report.

*2b Redaction layer* (`redaction.ts:204-226`): `redactFailedResult` keeps redaction + mint + `Error <ID>: ` prefix + `errorId` stamp; **no report** (the decorator above reports it with the explicit tracker). Order in `stack.ts` unchanged: read-only gate → redaction → decorator → audit → recovery (`stack.ts:12-33`), so the audit (`:92`, `readErrorId: readToolErrorId`) stores the same id.

*2c Nested failures* (`stack.ts:81` `redactNestedFailure`): a nested call never passes the decorator, so report here: `r = redactFailedResult(...); if internal: reporter.record({error: new ToolExecutionFailure(r.error), step:'Run nested tool', operation:'tool.call'}, {errorId: readToolErrorId({result:r}), attributes}); return r.error` (no explicit tracker available; async context is the enclosing `tool.call` span — documented limit). Helper `reportNestedFailure`.

*2d Delegated route describe* (`redaction.ts:119-134` `describeDelegatedInternalError`):
```
reason = redact(delegatedInternalErrorReason(context) or recoveryMessage)
errorId = context.errorId                                   # stamped failed/timed-out result → already reported
       ?? reporter.record({error: context.error, step:'Run tool', operation:'tool.call'},
                          {attributes:{'tool.id':label, 'agent.run.id':runId, source}}).errorId
                                                            # thrown error object → dedupe returns the decorator's id
return `Error ${errorId}: ${reason.text}`
```
The delegated route copies `readToolErrorId({result})` into `context.errorId` where it builds the context (`delegated-tools.ts` near `:208-225`). `correlationId` (UUID) is no longer written into any record.

*2e Daemon routes*: J2's reporter-backed `reportInternalError` already serves them; J4 only deletes the `onInternalError` plumbing. Model proxy: `reportProxyError` (`model-proxy.ts:398-403`) returns `requestId` = ERR id; it is sent as the SSE `error` event `code` (`:416-417`, `:440-442`) with fixed words `PROXY_STREAM_STOPPED_MESSAGE` — upstream text never reaches the client (closes C075's model-proxy part). `runs.ts:84-92` and `terminals.ts:92-100` same.

**3 State machine.** Tool op: `started → completed | denied | cancelled | failed | timed-out | threw` (existing labels, `observability.ts:22,97,105`). Mode: daemon goes LEGACY → REPORTER-ONLY in one release (reporter required) — no window inside the daemon, because a window where neither `onFailure` nor `reporter` is wired would drop incidents.

**4 Concurrency + crash.**
- One id: failed results — minted once in redaction, reused by decorator (`errorId` option, `record` writes under it), audit and model text. Timed-out — minted once in the decorator (record), stamped, reused by the route. Throws — minted once in the decorator, reused via the per-reporter mark by the route's `record`. Requires **the same reporter instance** at decorator and route (one per composition, T3).
- Recovery retries (`withToolFailureRecovery`, outermost): each attempt passes redaction + decorator → one id per attempt; the outer result is the last attempt's. Builder must verify recovery spreads result fields (`{...result, ...}`) so `errorId` survives; test pins it.
- Observability disabled: decorator still installed with NOOP tracker → report still happens (fixes the bypass).

**5 Failure modes.** Reporter breach (throws) → `attempt`-wrap each `record` in the decorator; the tool result/throw passes through unchanged (observation never gates, current rule `redaction.ts:179-181`). Redaction unchanged (`redactSecretShapes` before any text leaves). Record diagnostic of `ToolExecutionFailure` = already-redacted text.

**6 Invariants + tests** (`J/daemon/src/tool-recovery/__tests__/observability.test.ts`, `stack.test.ts`, `J/daemon/src/http/__tests__/{model-proxy,delegated-tools}.test.ts`).
- I4.1 `an internal failure gives one report tagged with the result's id and end({ failed: true })` — **mutation:** mint a new id in the decorator → red.
- I4.2 `a ToolInputError gives zero reports`; `a validation failed result gives zero reports`.
- I4.3 `with observability disabled a failed tool still writes one host record` — **mutation:** restore the `isNoopObservabilityPort` skip → red.
- I4.4 `the report carries the operation tracker's trace ids` — **mutation:** report inside `tracker.run` without the explicit `tracker` → red (recording tracker returns sentinel `traceIds`).
- I4.5 `one id in model text, audit row and host record for a failed tool` (stack test with audit sink).
- I4.6 `a thrown tool error answered by the delegated route keeps the decorator's id and is reported once` — **mutation:** remove the reporter dedupe → 2 records → red.
- I4.7 `a timed-out tool answered by the delegated route is reported once with one id`.
- I4.8 `model-proxy upstream failure returns plain words and an ERR- id, no upstream text`.

**7 Wiring.** Replacement port for T3: `createAssistantToolExecutor({ ..., reporter, toolFailures: { mintErrorId, redactSecretShapes } })` and `delegatedToolErrorDisclosure({ reporter, mintErrorId, redactSecretShapes })`. Daemon imports `ErrorReporter` type and `NOOP_OPERATION_TRACKER` from `@jini-ai/core/errors/reporter` only. Coordinate P10-O2 (same decorator: counters in `metrics`).

**8 OWNER-Q.** **Q-J4a** `cancelled`/`resolve-principal` route failures still get an id today via `describeDelegatedInternalError`. *Recommend:* keep (one record at the route; the decorator does not report `cancelled`), so behavior is unchanged and still exactly-once.

---
## P4-J5 · Jini · sidecar boundary

**1 Data model.** `createJsonIpcServer` second object (`json-ipc.ts:169-174`) gains `errors?: { reporter: ErrorReporter; observability?: Pick<ObservabilityPort,'trackOperation'>; methodOf?: (message: unknown) => string | undefined }` and `logger?: Pick<Logger,'error'|'warn'>`. Threaded via `bindJsonIpcSocket` → `dispatchJsonIpcHandler` (`:356`) as one `IpcFailurePorts` object. Changeset `@jini-ai/sidecar` minor.

**2 Algorithm** (`dispatchJsonIpcHandler`, reporter mode; legacy = today `:359-393`):
```
method = boundedMethod(errors.methodOf?.(message))       # /^[a-z][\w.:-]{0,63}$/i else 'unknown'
run = await runOperation({deps:{reporter, observability: observability ?? NOOP_OBS}, operation:'ipc.handle', scope:'ipc',
        step:'Handle sidecar request', fallback: IPC_FALLBACK, attributes:{'ipc.method':method, 'ipc.trace_id':traceId},
        work: () => handler({message})})
trace('server.handler_' + (run.ok ? 'success' : 'failed'), {..., errorId?})   # env-gated, injected logger
reply = run.ok ? {ok:true, result: run.value}
               : {ok:false, error:{code:'HANDLER_ERROR', message: run.failure.error.message,
                                   ...(run.failure.error.requestId ? {requestId: run.failure.error.requestId} : {})}}
safeEnd(socket, reply)                                   # try socket.end; on throw logger.warn (peer gone), no new incident
```
The unconditional `createConsoleLogger(...).error` at `:379` is **not** called in reporter mode (the reporter's host record replaces it). `traceJsonIpc` (`:82-85`) writes to `logger ?? console` (still env-gated). `methodOf` is host-validated dispatch (e.g. the host's own message schema's `type`); the handler's `unknown` message is never stringified into attributes.

**3 State machine.** CM-5 per server instance (chosen at `createJsonIpcServer`). Op: `started → completed | refused | failed`.

**4 Concurrency/crash.** One op per frame; frames are per connection (one frame per connection, `:160`). Peer disconnect before reply → `socket.end` no-op/throw → `safeEnd` logs a warn only; the incident (if any) is already recorded. Same reporter across HTTP and IPC in one process → dedupe also spans them.

**5 Failure modes.** Handler throws → incident with ERR id in `requestId` + words. `ClientFacingError` thrown → refusal: Q-J5a. Reporter breach → `safeDescribe` (J2) fallback id `ERR-0000-…`. Frame-size/idle refusals (SEC-004, `:170-173`) are transport refusals outside the op (unchanged).

**6 Invariants.** Tests in `J/sidecar/src/__tests__/json-ipc.contract.test.ts`:
- I5.1 `a handler throw yields one report and the ERR- id in requestId` — **mutation:** keep the console sink as well → recording logger sees 2 lines → red.
- I5.2 `without errors the legacy reply keeps traceId as requestId and logs once`.
- I5.3 `the ipc.method attribute is the bounded label, never message text` (message `{type:'x'.repeat(500)}` → `unknown`).
- I5.4 `a peer gone before the reply produces no second incident`.
- I5.5 `HANDLER_ERROR code is kept in reporter mode`.

**7 Wiring.** No Jini host passes `errors` yet (default unchanged). Tovu desktop binding (`D/main/boot/site-backend.ts` sidecar start) is **deferred** explicitly to a P4 follow-up; the plan's "Desktop: kill the sidecar handler" Electron check stays owed until that binding lands (per the check: add it or defer explicitly — deferred). The `ex-env*` edits the check names were not found on any Jini head touching `json-ipc.ts`; builder re-screens at start.

**8 OWNER-Q.** **Q-J5a** refusal on the wire: *Recommend:* keep `code:'HANDLER_ERROR'` and add `reason:<refusal code>` with the refusal's words, no `requestId` (peers that switch on `HANDLER_ERROR` keep working).

---
## P4-T1 · Tovu · T391 daemon shutdown idiom (READY; no Jini release)

**1 Data model.** None. `afterSettled({ promise })` from `@jini-ai/core/errors/idioms` (`J/core/src/errors/idioms.ts:32-34`: resolves `undefined` on either settlement; already consumed in Tovu at `W/assistant/site/visitor-tool-budgets.ts:4`).

**2 Algorithm.** `W/server/inbound/assistant/agent-daemon-server.ts:39-52` `exitDaemon` order (normative, unchanged except line `:48`):
1. `if (daemonExiting) return; daemonExiting = true` (second signal is a no-op, `:40-41`).
2. `stopIdleMonitor()`.
3. inside `closeWithinBound`: `await stopDaemonServing()` → `await Promise.allSettled(scope disposals)` (store closes, sinks flush) → **`await afterSettled({ promise: registryPublication })`** (was `.catch(() => undefined)`) → `removeIfCurrent({ pid })` (owned pointer removal; its own failure logged at `:52`) → exit.
Fixture: `W/server/runtime/composition/__tests__/process-root-parity.test.ts:426` add `"afterSettled"` to the `new Function` parameter list and pass a forwarding spy `({promise}) => { seen.push(promise); return afterSettled({promise}); }`.

**3 State machine.** `serving → exiting(draining) → scopes-closed → publication-settled → pointer-removed → exited`; a second signal in any non-`serving` state is absorbed.

**4 Concurrency/crash.** Two signals (`:435-436` in the fixture): only the first runs cleanup. Publication rejecting late (`:443`) still lets removal run. Crash before removal leaves a pointer the ownership guard (`removeIfCurrent`) handles at next start.

**5 Failure modes.** Publication rejection → swallowed by `afterSettled` (startup already reported it, comment `:47`). Removal failure → logged, exit continues.

**6 Invariants.** I6.1 `pointer removal waits for publication after the owned connections close` — spy gets the original promise **once**, after `store-closed`. Red today: spy never called. **Mutation:** drop the `await` → `remove:123` appears before rejection → red; move removal before it → red. I6.2 second-signal assertion (`:439`) unchanged. I6.3 final order `["store-closing","store-closed","remove:123","exit:143"]` (`:445`).

**7 Wiring.** None new. Rebase the fixture over `ex5-fnd-inject-tovu` (one-line import change in the same test file) if that lands first. **8 OWNER-Q.** None.

---
## P4-T2 · Tovu · reader compat, then the reporter behind `reportServerFailure` (+ C115)

**1 Data model.**
- New Tovu factory `createTovuErrorReporter({ logger, tracker, versions })` in `W/server/runtime/composition/error-reporter.ts`: ports `ids = { newId: () => mintToolErrorId({ randomHex: ({bytes}) => randomBytes(bytes).toString('hex') }) }`, `clock`, `logger` (Tovu server logger), `observability = trackerReportPort(tracker)` (adapter: `reportError({error, context}) => tracker.error({ error: asError(error) }, { context })`; `Tracker.error` takes `{ error: Error }`, `J/diagnostics/src/observability/tracker-types.ts:49`), `catalog = createErrorCatalog(...)` (`J/core/src/errors/catalog.ts:172`) with the Tovu sentence sets — **no Tovu catalog exists on the base** (`git grep createErrorCatalog` in Tovu: no hits), so T2 creates a minimal one (empty bindings for scope `admin`; refusals keep going through callers), `versions`, redaction `TOVU_ERROR_REDACTION_OPTIONS`.
- `AdminFailurePorts` (`W/server/inbound/shared/admin-failure.ts:32`) → `{ tracker?: Pick<Tracker,'error'>; reporter?: Pick<ErrorReporter,'record'> }`.
- `res.locals.failureReporter` (renamed from the plan's `adminFailureReporter` because it is not admin-only) set by **each owning composition**: website app (`W/server/runtime/composition/app.ts`) once for **all** paths (before public routes, not only the `/api/admin` middleware at `:419`), and the agent daemon composition (`agent-daemon-server.ts` server setup) for its routes. Tracker-only callers (`federation-reload-route.ts:51`, `commerce-http.ts:57`, 14 public-http files) read `res.locals.failureReporter` beside `adminFailureTracker`.
- Jini route host: `daemonRouteHost` (`W/server/runtime/composition/jini-routes.ts:62-69`) takes `errors: RouteErrorPorts` → `context: { ...required.context, errors }`, `reportInternalError: createReporterRouteInternalError({ reporter })`; `mountJiniRoutes` (`:28-39`) passes the reporter to the node-bridge (if Q-J2a accepted).

**2 Algorithm.**
*Step 1 — reader tests first* (`A/lib/admin-failure-channel.ts:128-142` `publishAdminFailure`, reference = `details.errorId ?? envelope.errorId ?? decoded.requestId` at `:135`): cases flat `{error, code, errorId}` with and without `details.failure`, nested Jini `{error:{code,message,requestId}}`, legacy UUID `requestId`, ERR id, missing id → each yields the same displayed reference (or none) and words. Test-only; no code change expected; red only if a shape regresses.
*Step 2 — `reportServerFailure` reporter mode* (`admin-failure.ts:54-64`, signature kept):
```
reportServerFailure({error, operation}, {tracker, reporter, errorId}):
  if reporter: return reporter.record({error, step: operation, operation}, errorId ? {errorId} : {})
               # host record (redacted, TOVU options) + one tracker report with the ORIGINAL error (adapter redacts)
  legacy: (today :58-63, unchanged until T5 proves every caller passes reporter)
```
The synthetic `new Error(diagnostic)` disappears on the reporter path. Default `errorId` minting moves into the reporter's `ids` port (same format).
*Step 3 — `adminFailureResponse` with C115* (`:70-80`; helper `correlatedAdminIncident`, ≤ 20 lines):
```
if options.status === undefined and error instanceof DatabaseDiskSpaceError:
    return {status: error.status, body: {code: error.code, error: error.message}}   # refusal FIRST: no report, no id
causeId  = errorIdInCause(error)            # the ERR id formatUserFacingError would adopt (:89-93), else undefined
recorded = reportServerFailure({error, operation}, {tracker, reporter, ...(causeId ? {errorId: causeId} : {})})
                                            # reporter mode: an error already recorded under this reporter returns its
                                            # prior id and writes nothing (CM-3.2); else one record under causeId or a new id
body = unexpectedAdminBody({errorId: recorded.errorId, options})
assert body.errorId === recorded.errorId    # test-pinned, not a runtime assert
return {status: options.status ?? 500, body}
```
Reordered versus the base (base mints for the body at `:75`, then reports at `:76`, then checks disk space at `:78` — the C115 bug): classify → record → build reply, so the reply can only carry the recorded id. (The check says C115's branch also correlates the response id — preserved.)
*Step 4 — rebind Jini routes*: `daemonRouteHost({ context, parserLimitBytes, errors })` at every scope composition.

**3 State machine.** CM-5 per Tovu composition: LEGACY (tracker only) → REPORTER (`failureReporter` present) → after T5 REPORTER-ONLY for the proven boundaries.

**4 Concurrency/crash.** One reporter per process composition, shared by admin, public and Jini-mounted routes and (T3) tools → dedupe spans them. `res.locals` is per request; the reporter itself is stateless (WeakMap only). Request middleware `reportServerError` (`W/server/inbound/shared/observability-middleware.ts:119-132`) reports a 5xx "unless the request's own work already reported" via `scope.reported`; the `trackerReportPort` adapter must go through the same `tracker.error` so `scope.reported` is set → no second tracker report for one admin 500 (I7.4).

**5 Failure modes.** Disk-space → 507 plain words, no id, no incident. Reporter breach → contained in `record`; `reportServerFailure` still returns an id (`UNAVAILABLE_ERROR_ID` worst case). Tracker adapter failure → reporter writes the "tracker did not accept" warn (`reporter.ts:112-117`). Redaction: host record redacted by reporter options; tracker gets the original error → Q-T2b.

**6 Invariants.** Tests in `W/server/inbound/shared/__tests__/admin-failure.unit.test.ts`, `A/lib/__tests__/admin-failure-channel.test.ts`, `W/server/runtime/composition/__tests__/jini-routes.unit.test.ts`:
- I7.1 reader matrix (5 shapes) green before and after.
- I7.2 `one admin failure writes one host record and one tracker report with the same ERR- id as the reply` — **mutation:** report twice / keep `console.error` beside the reporter → red.
- I7.3 `disk-space refusal reports nothing and carries no id` — **mutation:** report before the 507 branch → red.
- I7.4 `an admin 500 produces one tracker report, not also the http.request 5xx marker`.
- I7.5 `a Jini route mounted through daemonRouteHost answers with the reporter's ERR id` (replaces `jini-routes.unit.test.ts:132`'s callback pin).
- I7.6 `a failure already reported by a tool keeps its id in the admin reply` (dedupe).
- I7.7 `the 238 calling files do not change` — guard: diff of callers limited to the files listed above.

**7 Wiring.** Tovu owns the factory and `AdminFailurePorts`; Jini owns `RouteErrorPorts`. Composition passes `{ reporter, observability: trackerOperationPort(tracker) }` into `createLocalNodeDaemon`/`daemonRouteHost`. Must-not: `inbound/shared` imports no composition module (ADR-070 note at `admin-failure.ts:2-5`); the `Tracker` type import moves to `@jini-ai/core/contracts/site/diagnostics-observability` per `ex5-fnd-inject-tovu`/`ex5-fnd-seams-tovu`. Coordinate P12 #4 admin transport cut (reader file). Consume J2/J3/J4 in one dependency bump.

**8 OWNER-Q.**
- **Q-T2a** where public/daemon reporters live: *Recommend:* one `createTovuErrorReporter` call per process composition (website app; agent daemon), never per router; `app.ts:419` keeps setting the tracker and additionally the reporter app-wide.
- **Q-T2b** does Tovu's `Tracker.error` adapter blank secrets before export? The reporter now hands it the original error (`reporter.ts:146`). *Recommend:* STOP T2 until a test proves the Tovu tracker adapter applies `TOVU_ERROR_REDACTION_OPTIONS` (else wrap `trackerReportPort` with redaction).

---
## P4-T3 · Tovu · tool failures through the reporter

**1 Data model.** `W/assistant/tool-recovery-preset.ts`: `RedactedToolFailuresDeps` (`:70`) → `{ mintErrorId? }` (no `onFailure`); `failurePorts` (`:75-79`) drops the `console.error` `[tool-failure]` sink; `AssistantToolExecutorDeps` (`:99-106`) gains **required** `reporter`; `withRedactedToolFailures` (`:90-92`), `describeDelegatedInternalError` (`:93-95`), `delegatedToolErrorDisclosure` (`:96-98`) take `reporter`.

**2 Algorithm.** Bind the composition reporter (T2) along every executor path: (a) agent daemon `createScopeToolExecutor` (`W/server/inbound/assistant/agent-daemon-scope-tools.ts:120`) — add `reporter` to its arguments from the daemon composition; (b) delegated-tool route disclosure (`delegatedToolErrorDisclosure({}, { reporter })`); (c) BYOK/site-server executor path (same `createAssistantToolExecutor`). Pass-through only; algorithm = J4 §2.

**3 State machine.** REPORTER-ONLY (J4 made `reporter` required).

**4 Concurrency/crash.** The same reporter instance at decorator, delegated route and admin boundary → one id across them (I4.6).

**5 Failure modes.** As J4 §5. Disclosure paths keep `Error <ID>: <redacted reason>` for the model.

**6 Invariants.** I8.1 `a failed site tool shows the same ERR- id to the model and in the host log` (tracker enabled). I8.2 same with tracker disabled (`observabilityEnabled: () => false`) — **mutation:** restore the noop skip → red. I8.3 update `W/assistant/__tests__/delegated-tool-error-disclosure.test.ts:54` and `tool-executor-stack.failure-redaction.test.ts:159` to assert reporter records instead of `onInternalError`. I8.4 `standalone withRedactedToolFailures still redacts and stamps an id`.

**7 Wiring.** Rebase on `ex5-fnd-inject-tovu` (`prepareGuidance` type moves to `@jini-ai/core/contracts/site/daemon`). **8 OWNER-Q.** None.

---
## P4-T4 · Tovu · err-tovu FIX sheets — **LANDED** (`04d030b5a9` on merge-13)

Only regression reconcile is designed.
**Algorithm.** (1) Baseline: `npm run check:errors -- --list` on merge-13 → set `B` of `(rule, path)`. (2) For each unmerged head `H` in {`ex5-fnd-kit` (A/B), `ex5-fnd-seams` (C/O/H), `ex5-fnd-inject` (O/H), `ex4-media` (sheet I media repo)}: build its rename map from `git diff -M --name-status base..H`, run the check on `H` → `S_H`; normalize paths through the map; regressions `R_H = S_H − map(B)`. (3) Each `R_H` row is fixed on `H` (or in the merge) using the sheet's own fix, size rule (repair in place iff the function does not grow and stays ≤ 80 lines, else split first). (4) P6-T1 and P10 sheet-O follow-up consume the landed versions.
**Invariants.** I9.1 `check:errors -- --strict` after each merge shows no row absent on merge-13. I9.2 sheet I media-repo behavior test passes on `ex4-media`. No OWNER-Q.

---
## P4-T5 · Tovu · delete proven-duplicate sinks only

**1 Data model.** A list (in the PR description and a test file header) of boundaries proven to report twice after T2/T3. Base has exactly three `tracker.error(` calls under `W/server/inbound`: `admin-failure.ts:62` (legacy arm of `reportServerFailure`), `observability-middleware.ts:128` (5xx marker, guarded by `scope.reported`), `browser-telemetry.ts:112` (browser-sent errors — independent sink, **keep**).

**2 Algorithm.** For each candidate pair: (1) write a counting test that drives the boundary with a reporter + recording tracker; (2) if count = 2 → delete the redundant arm, keep the why-comment, test now asserts 1; if count = 1 → keep and record "independent". Expected outcome: delete the legacy arm of `reportServerFailure` once every caller passes `reporter` (grep `reportServerFailure(` call sites: 14 public-http files + `commerce-http.ts:57` + `federation-reload-route.ts:51` + shared); keep `observability-middleware.ts:128` (it is the fallback for 5xx not reported by work) and `browser-telemetry.ts:112`.

**3 State machine.** Per boundary: REPORTER → REPORTER-ONLY when proven.

**4/5.** No runtime concurrency change. Risk: deleting a sink whose reporter is not wired → incident lost → prevented by step (1).

**6 Invariants.** I10.1 one named one-report test per removed pair (e.g. `a public route failure is reported once`). I10.2 `browser telemetry still reaches the tracker`. I10.3 `an unreported 5xx still produces the http.request marker`. **Mutation:** re-add `console.error` beside `reporter.record` → I10.1 red.

**7 Wiring.** None new. **8 OWNER-Q.** None.

---
## Wiring doc (P12 ADR-071) — text for `J/core/src/errors/README.md` "Wiring" and Tovu `W/server/inbound/shared/INFO.md`

- **Required ports:** `ErrorReporterPorts` (`ids`, `clock`, `logger`, `observability.reportError`, `catalog`, `versions`) → `createErrorReporter`; `RouteErrorPorts` (`reporter`, `observability.trackOperation`) for HTTP; `reporter` (required) for the daemon tool stack; optional `errors` for `createJsonIpcServer`.
- **Provides:** one id, one host record, one tracker report per failure; one operation span per boundary (`http.route`, `tool.call`, `ipc.handle`).
- **Ownership:** HTTP → host passes `errors` once on `RouteHostContext` (preset: `createLocalNodeDaemon({ errors })`; Tovu: `daemonRouteHost({ …, errors })`). Tools → the same reporter into `createAssistantToolExecutor`. IPC → `createJsonIpcServer(…, { errors })` (desktop binding deferred).
- **Host binding example:** `const reporter = createErrorReporter({ ids, clock, logger, observability, catalog, versions }, { redaction }); createLocalNodeDaemon({ …, errors: { reporter, observability } });`
- **Prohibited imports:** Express in `@jini-ai/core`; `@jini-ai/diagnostics` in core/daemon/http-kit/sidecar; Tovu modules in Jini; composition modules from `inbound/shared`.
- Link ADR-071.

## Approval cards
P4 adds no destructive user action; no approval card is needed (N/A).
