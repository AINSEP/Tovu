REVISED r62t-rev-p4: 4 SOL sheets (2 Jini / 2 Tovu), 8 OPUS sheets

Verified against Tovu `7c87b3c3f9` and Jini `010c8cd87` on `origin/integ/merge-21-2026-11-24`. No files changed. No tests, builds, installs, or type-checks ran. The revised gate inventory is **31 Tovu test files and one production file**.

The sheets are grouped by builder as requested. Within that grouping, prerequisites control execution. Land J1 before J2a. J5 can run once J2a is staged, and T1 is independent. Stage J2b and J4 before T2 → T3 → T3b. Only then lift the hold on J3a → J3b. Ship the J3/J4 removals with the Tovu replacements in one coordinated cut, and run T5 against that wiring.

`J/` means Jini `packages/`. `W/`, `A/`, and `D/` mean Tovu `apps/website/src/`, `apps/admin/src/`, and `apps/desktop/src/`. `Empty` means `Record<string, never>`. Keep the two-object public APIs and `_optional = {}` pads, existing why-comments, 80-line and complexity-10 limits, authorization order, and wire compatibility. Inject host collaborators into existing argument objects. The pure core lifecycle imports and the server preset’s existing http-kit import edge are the specific bindings approved by the check. No sheet adds persisted state or a migration. Line numbers locate the current code, but the named functions are the anchors.

## P4-J1.J — Jini — refusal disclosure and L6 artifact

BUILDER: SOL

**Files.** Change `J/core/src/errors/reporter.ts` and `J/core/src/errors/__tests__/reporter.test.ts`. Create `.changeset/core-error-reporter-contract.md` with this exact content.

```md
---
"@jini-ai/core": major
---

Update the error reporter to use the observability port and report incidents with their error ID, label, operation, and tracker trace IDs. Read `OperationTracker.traceIds()` when the tracker provides it. Incident replies include the recovery action, and caller-facing refusals use the supplied fallback for `own-message` bindings.

Replace `ErrorReporterPorts.tracker` with `observability: Pick<ObservabilityPort, 'reportError'>`. Pass `operation` and `tracker` to `describe`, and pass `operation` to `record`. To bracket a unit of work with one operation tracker and one failure report, use `runOperation`.

`IncidentTrackerReport` and `createRecordingTracker` have been removed. Use `ErrorReport` from `@jini-ai/core/contracts/observability` and `createRecordingObservability` from `@jini-ai/core/errors/testing`. `createRecordingReporter().reports` now contains `ErrorReport` entries.
```

**Test first.** `an own-message match carrying a canary message answers the fallback words`. Inject a catalog that sets `message` on an `own-message` match. Assert fallback, original refusal code, and no incident. Mutation: use `match.message ?? fallback.message` in that arm. Retain the existing authorized-only sentence pin at `reporter.test.ts:278`.

**Edit.** At `refusalError` (`reporter.ts:157–169`), add private `refusalMessage(required: { match: ErrorMatch; fallback: { message: string }; audience: ErrorAudience }, _optional: Empty = {})` returning `{ kind: 'text'; message: string } | { kind: 'sentence'; sentence: NonNullable<ErrorMatch['sentence']> }`. Check audience before switching. `own-message` always falls back, `fixed` uses fixed copy or fallback, `sentence` requires a sentence. Use an exhaustive switch. Keep `refusalError`’s input and wire shape, and leave parameter redaction and interpolation there. Add the why-comment beside `own-message` that injected catalogs may supply the original exception text.

**API.** No export or baseline delta for the split. Opus checks complexity and L6 release coverage. The artifact mutation is removing this exact changeset against the pre-break baseline. Merge-21’s current baseline may already include those API changes, so a green artifact-deletion run against that baseline alone would not prove coverage.

## P4-J5.J — Jini — additive sidecar IPC reporter mode

BUILDER: SOL

**Prerequisite and files.** Use J2a’s staged core runner. Edit `J/sidecar/src/json-ipc.ts`, `src/__tests__/json-ipc.contract.test.ts`, and the sidecar README/API spec. Keep the wire type with its current owner. Screen the visible `ex-env*` refs for overlap with `json-ipc.ts` at implementation start. No production desktop adoption is part of this sheet.

**Tests first.**

- `a handler throw yields one report and the ERR- id in requestId`. Use `vi.spyOn(console, 'error')`. In reporter mode assert 0 console calls, `recordingLogger.error` called 1 time, and `reports.length === 1`. Mutation: restore the unconditional legacy console write in reporter mode.
- `without errors the legacy reply keeps traceId as requestId and logs once`.
- `the ipc.method attribute is the bounded label, never message text`. A 500-character method candidate becomes `unknown`.
- `a peer gone before the reply produces no second incident`.
- `HANDLER_ERROR code is kept in reporter mode`. A refusal includes `reason` and safe words, with no `requestId`. Pin success, an unserializable success result becoming an incident, and the existing oversized and idle frame behavior.

**Edit.** Import `runOperation` from `@jini-ai/core/errors/reporter`. Sidecar already imports core (`json-ipc.ts:14,21`). Keep `createJsonIpcServer({ socketPath, handler }, optional = {})` and its frame/idle options. Extend its existing options type with the following fields.

```ts
errors?: {
  reporter: ErrorReporter
  observability?: Pick<ObservabilityPort, 'trackOperation'>
  methodOf?: (required: { message: unknown }) => string | undefined
  refusalCode: 'HANDLER_ERROR'
}
logger?: Pick<Logger, 'error' | 'warn'>
```

Name the options type `JsonIpcServerOptions` and use this internal union.

```ts
type IpcFailurePorts =
  | { mode: 'legacy'; logger: Pick<Logger, 'error' | 'warn'> }
  | {
      mode: 'reporter'
      errors: NonNullable<JsonIpcServerOptions['errors']>
      logger: Pick<Logger, 'error' | 'warn'>
    }
```

Choose mode once at `createJsonIpcServer` (`:163–178`). Pass `IpcFailurePorts` in the **required** object of `bindJsonIpcSocket` (`:196–198`), `bindJsonIpcData` (`:276`), `parseAndDispatchJsonIpcFrame` (`:317`), and `dispatchJsonIpcHandler` (`:356`). Keep their second-argument pads. Use the same logger for server socket traces. In reporter mode derive `ipc.method` only from the host label accepted by `/^[a-z][\w.:-]{0,63}$/i`, otherwise `unknown`. Contain a throwing label function. Never use a raw message summary, arbitrary input key, or socket path as an operation attribute. Keep generated `ipc.trace_id` distinct from the incident ID.

Run one `ipc.handle` operation around handler execution and success serialization. Use scope `ipc`, step `Handle sidecar request`, and fallback words `The sidecar could not finish this request.` and `Try again, and report the error ID if it keeps failing.` End the operation before writing. Keep `HANDLER_ERROR` on failures. An incident includes the ERR ID in the words and `requestId`. A refusal uses `reason` for the refusal code and has no ID. Carry `reason` through the client parser and `ipcResponseError` without changing `code`.

`safeEnd({ socket, frame, logger }, _optional = {})` contains synchronous write failures and gone peers, with a fixed warning and no new incident. Keep the env trace gate. In reporter mode omit raw handler summaries and exception text from server traces. Without `errors`, preserve the old trace-ID reply and one unconditional incident write, currently at `json-ipc.ts:379`. Keep the SEC-004 frame-claiming and disclosure rationale.

**API.** Sidecar root only. No export-map delta. Add `.changeset/sidecar-ipc-reporter.md` as minor and review `api-baseline/jini-ai__sidecar.json`. The Electron handler-failure check stays owed until a host actually adopts IPC reporter mode. `D/main/boot/site-backend.ts` is a startup seam, not an existing binding of this factory.

## P4-T1.T — Tovu — shutdown settlement

BUILDER: SOL

**Files.** `W/server/inbound/assistant/agent-daemon-server.ts` and `W/server/runtime/composition/__tests__/process-root-parity.test.ts`.

**Test first.** Extend the existing `daemon shutdown waits for publication even when durability fails after rename` test at `:409–443`, retaining its name and assertions. Pin the design invariant `pointer removal waits for publication after the owned connections close` in that test. Add `afterSettled` to the `new Function` params at `:423` and pass a forwarding spy with `({ promise }: { promise: PromiseLike<unknown> }, _optional = {})`. Assert it receives the original publication promise once and sees `store-closed` already in the call log. Retain the second-signal no-op and final order `["store-closing","store-closed","remove:123","exit:143"]`. Mutation: drop `await` or move `removeIfCurrent` before settlement.

**Edit.** Import `afterSettled` from `@jini-ai/core/errors/idioms` and replace only `await registryPublication.catch(() => undefined)` at `agent-daemon-server.ts:54` with `await afterSettled({ promise: registryPublication })`. The idiom is in `J/core/src/errors/idioms.ts:32–34`. Keep the existing `exitDaemon({ exitCode }, _optional = {})`, listener drain, per-scope disposal, PID ownership check, and publication/delete rationale. No new port, dependency version, export, changeset, or baseline.

## P4-T5.T — Tovu — prove error-report ownership

BUILDER: SOL

**Prerequisite.** Run against the coordinated reporter wiring from T2/T3. This is a deterministic **test-only commit**. **No production deletion in this commit.**

**Files and tests.**

- In `W/server/inbound/shared/__tests__/observability-error-report.test.ts`, add `a public route failure is reported once`. Drive a reporter-bound public failure through the real request tracker. Assert the boundary records one incident and that request completion does not add an `http.request` marker. Mutation: add `console.error` alongside `reporter.record`. Count console calls separately so the mutation goes red even if the tracker count stays at one.
- In the same file, add `an unreported 5xx still produces the http.request marker`. Drive a 5xx with no prior report **in that request**. Assert the single tracker report is the marker from `W/server/inbound/shared/observability-middleware.ts:119–131`.
- In `W/server/inbound/admin-http/routes/system/__tests__/browser-telemetry.unit.test.ts`, add `browser telemetry still reaches the tracker`. Use the mounted browser route with one admitted browser error and assert the single tracker report is the browser event. The route now lives at `J/cms/src/admin-http/routes/system/browser-telemetry.ts:126–155` and Tovu binds it from `W/server/runtime/composition/modules/system-telemetry.ts:29–41`.

In reporter mode each test expects **0 `console.error`, exactly 1 `logger.error`, and exactly 1 `tracker.error`**. For the marker and browser cases, establish the one logger call with a separate host-only reporter control before driving the boundary under test. Snapshot the counters after the control and assert the marker or browser event adds one tracker call and **zero** host logs. This keeps the exact count assertions without granting either independent tracker path a new production logging responsibility. Use a real tracker with recording observability for the measured path.

List the candidates in the test header and PR description. The legacy `reportServerFailure` arm at `W/server/inbound/shared/admin-failure.ts:54–64` is mutually exclusive with reporter mode. The unreported-5xx marker and browser telemetry have independent owners. Cookie-consent diagnostic-unavailable catches are not proven duplicates. Opus owns the separate retirement of the legacy arm once every caller passes `reporter`, including detached member delivery and OIDC, and the counting evidence justifies removal. No API, dependency, or baseline delta.

## P4-J2a.J — Jini — core operation lifecycle and Fetch reporter mode

BUILDER: OPUS

**Prerequisite and files.** Stage after J1. Change `J/core/src/errors/{reporter.ts,__tests__/reporter.test.ts,__tests__/boundary.test.ts,README.md}` and `J/core/src/contracts/{server.ts,server/json-route.ts,server/__tests__/json-route.test.ts}`. Create `contracts/server/client-facing-error.ts`. `runOperation` is at `reporter.ts:222–239`. The defect is that `trackOperation` can reject the whole path, `end` inside the work catch can turn success into an incident, and every resolved value currently counts as completed.

**Tests first.** Use a real reporter over recording ports and a legacy sink spy. Pin the Fetch side of these contracts.

| Test | Required pin |
|---|---|
| `a throwing route with a reporter returns one ERR- id that matches the single host record and the single tracker report` | Mutation mints a second ID or makes a second record. |
| `one http.route operation per request, attribute http.route is the pattern` | `/runs/abc?x=1` against `/runs/:id`. Assert the registered pattern, not the URL, and end before returning a successful response. |
| `a returned refusal ends the operation as refused with no report` | Cover parse, handle, and Fetch 413 in `request-body.ts`. Dropping `classify` goes red. |
| `a thrown ClientFacingError is refused at its own status with no id` | Safe words and zero reports. |
| `ports.onError answers before the reporter and the reporter records nothing for it` | Count boundary reporter calls separately from records the policy owns. |
| `a throwing onError still answers with the original failure's id and records the policy failure separately` | Two distinct errors and IDs. Only the original ID goes on the wire. |
| `without errors the legacy path still answers with requestId and calls onInternalError` / `with errors, a passed onInternalError is never called` | Both sinks firing is a mutation. |
| `a disconnected client gets no write, the operation ends cancelled, nothing is reported` | Keep the bodyless 499 sentinel. Test a returned disconnect and an aborted signal with an abort-like throw. A non-abort throw after disconnect still records. |
| `a tracker whose end throws leaves a successful request answered 200 with zero reports` | Also pin a throwing `trackOperation`, a throwing reporter, and no handler retry. |
| `a route that returns the reporter-backed INTERNAL_ERROR ends failed with exactly one report` | The producer owns the report. The classifier does not record it again. |

Add core pins for same-object reuse, independently created reporters, primitive non-dedupe, and throwing or rejecting diagnostics ports. Narrow the cancelled arm in existing boundary tests.

**Core API and lifecycle.**

```ts
type OperationVerdict = {
  outcome: 'completed' | 'refused' | 'failed' | 'cancelled'
  failed: boolean
  attributes?: OperationAttributes
}

runOperation<T>(
  required: {
    deps: {
      reporter: ErrorReporter
      observability?: Pick<ObservabilityPort, 'trackOperation'>
    }
    operation: string
    scope: string
    step: string
    fallback: { message: string; action: string }
    work: () => Promise<T>
    attributes?: OperationAttributes
    classify?: (value: T) => OperationVerdict
    settle?: (error: unknown) => OperationVerdict | undefined
  },
  optional: DescribeFailureOptions = {},
): Promise<
  | { ok: true; value: T; verdict: OperationVerdict }
  | { ok: false; failure: DescribedFailure; verdict: OperationVerdict }
  | { ok: false; cancelled: true; verdict: OperationVerdict }
>
```

`settle` is for cancellation here. Default resolved work to `completed`. Export `startOperation({ observability?, name, attributes? }, _optional = {})`, `endOnce({ tracker, verdict }, _optional = {})`, and `NOOP_OPERATION_TRACKER` from the existing reporter entry. `endOnce` accepts the core `OperationTrackingOutcome` so daemon outcomes such as `timed-out` keep their names. Contain a broken `trackOperation`. Settle work, then call `endOnce` once outside the work catch. Never retry the handler because a tracker failed. On a reporter breach return the fixed fallback and `UNAVAILABLE_ERROR_ID`. Do not add `onReporterBreach` or write to a global, Node, or vendor sink.

Add `attributes?: OperationAttributes` to `DescribeFailureOptions` and `RecordFailureOptions`. Forward accepted attributes to host `meta.attributes` and `ErrorReport.context.attributes`. Keep only known fixed fields and bounded scalar values. Strings use `^[\w.:/-]{1,128}$` and numbers must be finite. Reject raw URLs, query strings, body fields, tokens, and free-text metadata at the origin. The regex does not redact secrets. Add a per-reporter `WeakMap<object, string>`. Check before minting or writing so a second boundary gets the first ID and no second report. `describe` still classifies refusals first and respects a supplied already-recorded ID. Do not dedupe primitives. Read explicit operation tracker trace IDs for the tracker report.

**Class move.** Move `ClientFacingError` and its SEC-005 explanation verbatim from `json-route.ts` to the leaf. Add `export * from './server/client-facing-error.js';` after `J/core/src/contracts/server.ts:130`. Repoint `errors/reporter.ts:11` to `../contracts/server/client-facing-error.js`. Repoint `errors/__tests__/reporter.test.ts:7` and `errors/__tests__/boundary.test.ts:2` to `../../contracts/server/client-facing-error.js`. Split `contracts/server/__tests__/json-route.test.ts:3` so the class comes from `../client-facing-error.js`. In `json-route.ts` import it from `./client-facing-error.js`. Do not leave a re-export in `json-route.ts`. Run the runtime-cycle guard before and after.

**Fetch binding.** Add `RouteHostContext.errors?: RouteErrorPorts` with exactly `{ readonly reporter: ErrorReporter; readonly observability: Pick<ObservabilityPort, 'trackOperation'> }`. Fetch uses the same core reporter helpers directly via the intra-package relative import for `@jini-ai/core/errors/reporter`. No helper is a port.

Use `plans/ALGO-P4-errors.md:134–160` on `origin/plan/whats-left-1122` as the body recipe for `legacyAnswer`, `tracedAnswer`, and `verdictFor`. `answerJsonRoute` selects the mode at route creation. With no `errors`, keep today’s try/catch as `legacyAnswer`. In reporter mode `routeAnswerTagged` preserves raw read → workspace → origin → authenticate → parse → handle → final answer. Classify typed returned failures before serialization. Non-`INTERNAL_ERROR` refusals are `refused`. An already-reported `INTERNAL_ERROR` is `failed`, with no new record. Success is `completed`. The bodyless 499 path is `cancelled`. A thrown abort is cancellation only when the signal is aborted and the throw is abort-like.

Run with operation `http.route`, scope `http`, anonymous audience, step `Handle ${METHOD} ${spec.path}`, `http.method` and registered `http.route` at start, and `http.status_code` at end. Fallback words are `The server could not finish this request.` and `Check whether your change was saved, then try again. If it keeps failing, report the error ID.` `hostPolicyAnswer` calls `onError` before reporter classification, classifies the returned status, and on a throw records the policy error separately without masking the original. `failureResponse` retains `{ error: ServerApiError }`, its proper status, and the original incident ID. End before returning the response. Stream drain is transport-owned.

**API and docs.** Keep `./contracts/server` and `./errors/reporter`. No export-map delta. Add `.changeset/core-route-operation.md` as minor and review `api-baseline/jini-ai__core.json`, including the cancellation arm. Add Wiring to `errors/README.md` with the required reporter ports, HTTP/tool/IPC ownership, a host binding example, ADR-071, and the distinction between an operator record and an exported tracker record. Keep core Fetch-only and vendor-neutral.

## P4-J2b.J — Jini — Express, raw, node bridge, and server preset reporter mode

BUILDER: OPUS

**Prerequisite and files.** Use staged J2a. Edit `J/http-kit/src/{adapter.ts,raw-route.ts,origin.ts,node-bridge.ts,index.ts}` and create `reporter-internal-error.ts`. Tests are in `http-kit/src/__tests__/{adapter,adapter-pins,adapter-returned-errors,node-bridge,raw-route}.test.ts`. Edit `J/server/src/{route-host,mount-routes,compose-jini-kernel,create-local-node-daemon}.ts` and `server/src/__tests__/route-host.test.ts`. Anchor at `mountJsonRoute`, `mountRawRoute`, `createNodeDispatcher`, and `presetRouteHost`. Preserve merge-21’s `onReturnedError` parse/handle phase and optional `entityType`/by-ID authorize forwarding.

**Tests first.** Run the HTTP counting contract through Express. Pin one throwing route → one matching ERR ID, host record and tracker report, one `http.route` operation with the registered pattern, success end-before-write, parse/handle and in-route 413 refusals with no record, and a thrown `ClientFacingError` with its safe status and no ID. Pin `onError` precedence, an independently recorded policy throw with the original incident in the reply, and no second response after headers. Pin legacy mode still calling `onInternalError` and reporter mode never doing so. Pin disconnect with no write or report for abort-like throws, and a report but no write for a non-abort throw after disconnect. A tracker `end` throw leaves a successful 200 and zero reports. A returned in-route reporter-backed `INTERNAL_ERROR` ends `failed` without reporting twice.

Add `an oversized Express body never starts an http.route operation` against upstream `middleware.ts:23–35`, distinct from the adapter’s in-route body cap at `adapter.ts:150–160`. Pin raw reporter mode and partial stream failure. Pin node bridge behavior for a failure without `next`, a post-header write failure, and pre-header `next(error)`. Retain server parser ceiling and context identity tests.

**Edit.** Import the pure `runOperation`, `startOperation`, `endOnce`, and `NOOP_OPERATION_TRACKER` helpers directly from `@jini-ai/core/errors/reporter` where used. The only HTTP port bundle is `{ reporter, observability }`. Add and export `createReporterRouteInternalError({ reporter }: { reporter: Pick<ErrorReporter, 'record'> }, _optional: Empty = {}): ReportRouteInternalError` from the http-kit root. Keep the generic required `{ report, logSource, message }` and compatibility second object. In reporter mode ignore the legacy sink option. Record once with `operation: 'http.route'` and `step: logSource`. Copy only bounded `runId`, `batchId`, `source`, `provider`, and `operation` attributes. Return `INTERNAL_ERROR` with the same ID in the plain message and `requestId`.

- **Express.** Keep response-close abort and `finally` cleanup. `serveExpressRoute` returns `{ write, verdict }` for adapter-owned writes. Calculate body-cap and origin refusals without writing, then execute the original response/header writers after operation end. Preserve explicit `RouteReply` statuses and bodies. Classify before `onReturnedError` shapes the wire. The write-style `onError` is the exception to end-before-write. Call it once and classify actual status. A policy throw is its own incident and must not replace the original. If headers are sent, do not answer again. A write-closure failure is transport-owned, not a new route operation or a reason to rerun the handler.
- **Raw.** Pass the same mounted reporter to execution and exception/write paths. Span route execution through response creation, not stream drain. Preserve deferred body read, headers, cookies, and gate order. Record a non-disconnect stream failure once and close.
- **Node bridge.** Add `reporter?: Pick<ErrorReporter, 'record'>` to `NodeDispatcherOptions`. Choose the ref source once. Before headers, delegate to Express `next(error)` without recording first. Without `next`, record the unhandled error and put its ERR ID in the existing plain response. After headers, record and destroy without a second reply. Keep 12-hex refs only without the reporter. Do not add a second span around an already traced route.
- **Server preset.** Add exactly `errors?: RouteErrorPorts` to `CreateLocalNodeDaemonConfig`. Forward it on the existing `adapter` in `create-local-node-daemon.ts` and through kernel and extension mounts. `presetRouteHost({ context, parserLimitBytes }, _optional = {})` imports `createReporterRouteInternalError` from `@jini-ai/http-kit` on the existing import edge at `route-host.ts:10`. It binds `createReporterRouteInternalError({ reporter: context.errors.reporter })` when errors are present and `reportRouteInternalError` otherwise. Preserve `context` identity, parser limits, and both preset overloads’ pack and binding constraints. Forward the same reporter to `createNodeDispatcher` in `mount-routes.ts:39`. `J/daemon/src/http/route-table.ts:52–60` already forwards `host.context`.

Use the generic HTTP fallback words `The server could not finish this request.` and `Check whether your change was saved, then try again. If it keeps failing, report the error ID.` Keep anonymous disclosure. Add why-comments for `onError` precedence, registered patterns, response-close cancellation, and owner of each write. Do not overwrite landed adapter behavior with an older foundation branch.

**API.** Existing http-kit root and `./node-bridge`, and server root. No export-map delta. Add minor `.changeset/http-kit-route-reporter.md` and `.changeset/server-route-reporter.md`. Review `api-baseline/jini-ai__http-kit.json` and `api-baseline/jini-ai__server.json`, including signature-only deltas.

## P4-J4.J — Jini — daemon route and tool incident ownership

BUILDER: OPUS

**Prerequisite and files.** Stage after J2a/J2b. Under `J/daemon/src/http/` migrate `attachment-lookup-routes.ts`, `attachments.ts`, `connectors.ts`, `db-ops.ts`, `delegated-tools.ts`, `media.ts`, `memory.ts`, `model-proxy.ts`, `remote-run-events.ts`, `research.ts`, `runs.ts`, `terminals.ts`, `tool-execution-routes.ts`, and `xai.ts`. Edit `tool-recovery/{observability,stack,redaction,index}.ts`, the HTTP/type surface for these contracts, and route docs and server OpenAPI comments describing the deleted sink. Preserve unrelated `onInternalError` callbacks in `run-lifecycle{,-timers}.ts`, `agent-executor/event-cleanup.ts`, and `tool-recovery/federated-refusal.ts`.

**Tests first.** Use `http/__tests__/{model-proxy,delegated-tools}.test.ts` and `tool-recovery/__tests__/{observability,observability-w2g.unit,stack,stack-observability,forced-confirmation-forwarding}.test.ts`. Rebind fixture construction to recording reporters.

- `an internal failure gives one report tagged with the result's id and end({ failed: true })`
- `a ToolInputError gives zero reports`
- `a validation failed result gives zero reports`
- `with observability disabled a failed tool still writes one host record`
- `the report carries the operation tracker's trace ids`
- `one id in model text, audit row and host record for a failed tool`
- `a thrown tool error answered by the delegated route keeps the decorator's id and is reported once`
- `a timed-out tool answered by the delegated route is reported once with one id`
- `model-proxy upstream failure returns plain words and an ERR- id, no upstream text`
- `a throwing describeInternalError writes no console line and keeps one id`

Mutations mint a second ID, restore the noop skip, omit the explicit tracker, and remove object dedupe. Use a fake `traceIds()` sentinel. For 500 and timeout paths assert the ID in the response words and `requestId` and exactly one host incident. Cover fixed-provider and catch-all proxy paths, SSE failure after stream start, nested failure, and retry preserving the final attempt’s ID. For the throwing describer, spy on `console.error` and assert zero calls and one correlated incident.

**Tool contracts.** `createAssistantToolExecutor(required: AssistantToolExecutorDeps, _optional = {})` adds required `reporter: Pick<ErrorReporter, 'record'>` and keeps the field name `toolFailures` with exactly `{ mintErrorId: () => string; redactSecretShapes: (required: { text: string }) => { text: string; redactions: number } }`, using the current `redaction.ts:171` signature. Delete `onFailure`, `ToolFailureRecord`, `safeOnFailure`, and their barrel and type references. Keep existing recovery, registry, surface, audit and ID ports. Keep the reduced dep shape in `redactFailedResult` and `withRedactedToolFailures({ inner, mintErrorId, redactSecretShapes }, _optional = {})`.

`withToolCallObservability({ inner, reporter, observability? }, { isRegisteredTool?, observabilityEnabled? } = {})` accepts optional `Pick<ObservabilityPort,'trackOperation'> & Partial<Pick<ObservabilityPort,'metric' | 'supportsMetric'>>`. Do not inject a lifecycle port. Import `startOperation`, `NOOP_OPERATION_TRACKER` and `endOnce` directly from core’s reporter entry, following `plans/ALGO-P4-errors.md:258`. Install the decorator unconditionally. The observation predicate controls spans and metrics, not recording. Preserve read-only enforcement → redaction → operation/report → audit → recovery, inner to outer.

Split `settleThrownToolCall`, `settleToolResult`, `reportNestedFailure`, and metric settlement. Record an internal throw with the original object and explicit tracker, then rethrow unchanged. For a failed internal result use `readToolErrorId({ result })` in the record options and wrap only already-redacted words. On timeout record once and stamp the returned result. Denied, cancelled, and validation results do not record in the decorator. Contain a reporter breach without replacing the result or throw. Nested execution bypasses the decorator, so redact, stamp, and record once in the nested-failure hook using the available enclosing context. Preserve fixed outcome labels and metrics. P10-O2 counters stay follow-up work.

**Route seam.** At `delegated-tools.ts:84–98,213–235`, add `errorId?: string` to the disclosure context and pass IDs for timed-out and failed results in process. Drop legacy `correlationId`. Require `status === 'failed'` plus an ID for `isRedactedToolFailure`. Keep the 422 model-safe path and `Error <ID>: <redacted reason>` words. Replace the old record-then-describe 500 path with a disclosure result `{ errorId: string; message: string }` from `delegatedToolErrorDisclosure({ reporter, mintErrorId, redactSecretShapes, reportCancelled: true }, _optional = {})`. Its `describeDelegatedInternalError({ context, reporter, mintErrorId, redactSecretShapes, reportCancelled }, _optional = {})` reuses a trusted stamped ID without writing or records an unstamped failure through the same reporter. The same thrown object dedupes across decorator and route. Cancelled results and resolve-principal incidents are route-owned. Never treat a client-supplied ID as proof of recording.

Remove the global console call in `describeSafely`’s catch (`delegated-tools.ts:219–220`). Use the injected logger option on the existing route deps object for a fixed warning about the describer breach. Tovu binds its scoped logger. Contain logger failure and do not attach raw error text or fall back to console. If disclosure is missing or throws, reuse a trusted stamped ID if present, otherwise call the injected `reportInternalError` once for the original failure. Its `requestId` and the displayed ID agree.

Strip the retired optional HTTP sink from the listed deps and second arguments, keeping the `_optional` pads. Preserve safe words and gate order. In model proxy SSE use the reporter’s `requestId` as the error `code` with only `PROXY_STREAM_STOPPED_MESSAGE`. Do not forward upstream exception or event text. Add why-comments for recording with tracing off, trusted reuse of stamped IDs, and keeping recovery outside the per-attempt decorator.

**API and cut.** Existing daemon `./http` and `./tool-recovery` subpaths. Add major `.changeset/daemon-route-tool-reporter.md` and update `api-baseline/jini-ai__daemon.json`. J4 ships in the same coordinated cut as T3, T2 and J3. In particular, the Tovu `delegated-tool-error-disclosure`, `tool-executor-stack.failure-redaction`, and `agent-daemon-server.typed-tools.integration` fixtures must move off the removed sinks in that cut. No interim release with tools missing their recorder.

## P4-T2.T — Tovu — reader parity and host reporter composition

BUILDER: OPUS

**Prerequisites.** Use staged J2a/J2b and J4. Establish the reporter and owning compositions here. T3b completes the explicit mount and test-consumer migration before J3 retirement. T2 defines the host binding needed at every one of those seams.

**Tests first.** Run E4-T-READERS through the real Tovu binding at `A/lib/admin-failure-channel.ts:9,21–31`. Use `A/lib/__tests__/admin-failure-channel.unit.test.ts:16–24` and `api-request.characterization.test.ts:186–189`. Cover flat replies with approved details and without details, nested `requestId`, a legacy UUID, an ERR ID, and missing ID. Pin precedence `details.errorId` → flat `errorId` → decoded `requestId`. Signed-out and auth routes do not adopt details. The actual decoder/publisher is `J/admin/src/shell/lib/admin-failure-reporter.ts:165–205`, with nested decode in `J/protocol/src/errors.ts:90–122`. No production reader change.

Create `W/server/inbound/shared/__tests__/admin-failure.unit.test.ts` for pure lifecycle pins. Extend the existing `observability-error-report.test.ts` and the moved `W/platform/express/__tests__/jini-routes.unit.test.ts:132` for the real tracker, request scope and host mount.

- `one admin failure writes one host record and one tracker report with the same ERR- id as the reply`
- `disk-space refusal reports nothing and carries no id`
- `an admin 500 produces one tracker report, not also the http.request 5xx marker`
- `a Jini route mounted through daemonRouteHost answers with the reporter's ERR id`
- `a failure already reported by a tool keeps its id in the admin reply`

Mutations restore the console sink or record twice, and move reporting ahead of the landed C115 507 refusal. Pin the request’s already-reported case separately from the genuinely unreported 5xx fallback. Add a two-site daemon fixture that fails if either site’s incident reaches the other’s tracker. Use the actual site-provider payload, not desktop product telemetry, to prove redaction. Check a Tovu-specific shape in message, stack, attributes, and serialized error. In a separate case, call `record` with `exactSecrets: ['canary-secret']` and assert the canary is absent at the provider.

**Exact-secret fix.** Current core `reportToTracker` (`J/core/src/errors/reporter.ts:110–128`) hands over raw `error` but does not forward the per-call `exactSecrets` promised by the `recordIncident` comment at `:146`. If the exact-secret canary is red, Opus fixes core. Forward `exactSecrets` on `ErrorReport.context` from both `record` and `describe` incident paths and have `trackerReportPort` call `redactedTovuError({ error }, { exactSecrets })`. Treat `exactSecrets` as private in-process redaction input. Consume it before projecting provider-bound context, never serialize the array, and filter any accepted attribute values against it. Do not ship the reporter binding with a red provider canary.

**Factory.** Create `W/server/runtime/composition/error-reporter.ts`.

```ts
createTovuErrorReporter(
  required: {
    logger: Pick<Logger, 'warn' | 'error'>
    tracker: Pick<Tracker, 'error'>
    clock: Clock
    versions: { app: string; jini: string }
  },
  _optional: Empty = {},
): ErrorReporter
```

Use the `createErrorCatalog` factory (`J/core/src/errors/catalog.ts:172`) with empty `admin`, `http`, and `ipc` bindings where the host already owns refusals. Pass `{ redaction: TOVU_ERROR_REDACTION_OPTIONS }` as the second argument to `createErrorReporter`. Bind the ID generator with `mintToolErrorId({ randomHex: ({ bytes }) => randomBytes(bytes).toString("hex") })` and the injected logger and clock. Name the server-only build-constant module `W/server/runtime/composition/build-constants.ts`. Resolve `versions.app` from the running build’s version once at host startup, using the existing `TOVU_VERSION` → `TOVU_IMAGE_TAG` precedence in `site-deps/site-update-binding.ts:26–32` for deployed sites and the running app artifact’s manifest version for local builds. Resolve `versions.jini` from the installed manifest of the core package actually resolved by that host, not the root dependency range. Desktop uses the running Electron app’s version. Pass these values to composition. No browser constants or per-request resolution.

`trackerReportPort({ tracker }, _optional = {})` uses the existing `redactedTovuError` (`packages/contracts/src/diagnostics-redaction.ts:25–28`) before `tracker.error`. Export to the tracker a clean `Error` view with no raw `cause` or enumerable custom fields. Project bounded incident ID and trace metadata through the tracker’s scope admission and provider filtering. `Tracker.error` is at `J/core/src/contracts/site/diagnostics-observability.ts:49`, implemented by `J/diagnostics/src/observability/{tracker,report-error}.ts`.

**Shared lifecycle.** In `W/server/inbound/shared/admin-failure.ts`, use `AdminFailurePorts = { tracker?: Pick<Tracker,'error'>; reporter?: Pick<ErrorReporter,'record'>; trackerAlreadyReported?: boolean }`. Keep `reportServerFailure({ error, operation }, { tracker, reporter, errorId?, trackerAlreadyReported? } = {})`. In reporter mode call `record({ error, step: operation, operation }, { errorId?, tracker?: 'skip' })`. Select `skip` only for an actual prior admission of this failure in the request scope, not merely because some unrelated request work reported. Do not call the legacy console or tracker sink on that arm. Keep the fallback for unbound callers. Contain a reporter breach with a fixed diagnostic and unavailable ID, with no fallback mint.

`adminFailureResponse({ error, tracker?, reporter?, trackerAlreadyReported? }, options = {})` keeps C115 first (`admin-failure.ts:75–82`). Then classify → obtain the recorded ID → build the response. Use the existing formatter rule on the **approved disclosure cause** to find an eligible existing ID, not a regex on arbitrary thrown content. If the cached reporter ID wins over a competing approved-cause ID, the recorded ID wins in both the response and Copy details. Suppress the competing ID for that formatting pass and pin it. Do not widen anonymous disclosure or add previously unapproved causes. `sendAdminFailure` reads `res.locals.failureReporter` alongside the tracker and shared admission scope. `inbound/shared` never imports composition.

**Host edges.**

- `createApp` (`W/server/runtime/composition/app.ts:419–456`) binds once before `applyPublicMiddleware`, public routes and admin mounts. Reuse the same site reporter for any internal-export app built from that site’s composition. Put `failureReporter` on `res.locals` app-wide before the public/admin split. The admin-only tracker middleware at `:431` does not replace this. Keep request ID, ALS admission and the fallback marker owned by `applyRequestTracking`. Preserve artifact exclusions and mount order.
- Bind the reporter at the direct failure branches in `admin-json-route-ports.ts:233,315`. Pass it through existing seams in the live tracker-only callers. The verified anchors are `admin-http/http/widgets.ts:53`, `routes/agent-plugins/install-response.ts:79`, `routes/analytics/recent-hits.ts:101`, `routes/posts/template-preview.ts:232`, and `routes/publish-content/{import-errors.ts:32,route-helpers.ts:51}` and their registrars. Include `inbound/assistant/federation-reload-route.ts:51`, `composition/commerce-http.ts:58`, public middleware `site-cookie-consent.ts` and `theme-page-preview.ts`, and public routes `content/posts/get-by-slug.ts`, `mail-feedback.ts`, `members/{complete-sign-in,sign-in}.ts`, and `site/{newsletter-confirm,newsletter-unsubscribe,products,search,seo-documents}.ts`. `seo-documents.ts:29` is the live shared reporting seam for the consolidated SEO routes. Bind detached member delivery at `sign-in.ts:56` and member OIDC at `composition/modules/members.ts:167` in their existing registration closures, not from a closed response. Leave the broad `sendAdminFailure` caller population on the shared adapter.
- At the **moved** `W/platform/express/jini-routes.ts:29–39,192–199`, `daemonRouteHost({ context, parserLimitBytes, errors }, _optional = {})` forwards `context: { ...context, errors }` and binds `createReporterRouteInternalError({ reporter: errors.reporter })`. Add `reporter?` to the existing `mountJiniRoutes({ app, routes }, { rawBody?, redactionPatterns?, reporter? } = {})` options and pass it to `createNodeDispatcher` at `:34`. Preserve fallthrough, route spelling, parser limits, raw uploads and request facts. Bind the same reporter through scope HTTP and attachment mounts, `assistant/surface-route-host.ts:15–16` through the `a2ui` and `mcp-ui` registrars, `composition/modules/assistant-tool-exec.ts:102,258`, and `composition/modules/site-assistant.ts:618` through `assistant/site/visitor-frontend-control.ts:27,85`. Pass bound host/dispatcher callbacks through existing ports. For desktop HTTP, use the desktop diagnostic binding from `D/desktop-chat-main.ts:57–59` into `createDesktopAgentRuntime` and `startBridgeServer` in `D/desktop-agent.ts:384–403,491–507`. Do not borrow a site tracker. This is not desktop IPC adoption.
- Inject the factory through both launch paths at `agent-daemon-server.ts:211,254`. Build once after authorized site deps arrive at `agent-daemon-scope.ts:145`, then supply the same reporter to HTTP and T3 tools. A daemon process can host multiple sites. The authenticated, site-bound scope owns the reporter, not the OS process. Use an explicit no-op operation port for a host without operation tracking.
- Supply the composition-owned `errors` binding at the seven mount seams covered by the check: capped content via `modules/capped-route-app.ts` and its `modules/posts.ts` callers, widgets via `modules/widgets.ts`, forms via `modules/forms-admin.ts`, direct dev auth via `inbound/admin-http/dev-auth.ts`, admin JSON and public JSON via `admin-json-route-ports.ts`, and admin/public raw via `admin-raw-route-ports.ts`. Pass the binding to the mount adapter, not into route-spec business deps. Preserve the capped content handler order, dev-auth envelopes and raw origin policy. T3b owns completion of this gate across all registrations.

**Docs, manifest, acceptance.** Add Wiring to `W/server/inbound/shared/INFO.md` with required bindings, site scope, ADR-071, and why shared inbound code never imports composition. Update the root manifest and lockfile together to the actual coordinated artifacts. In the checker’s snapshot the direct ranges were core `:147`, daemon `:148`, http-kit `:152`, server `:166`, and sidecar `:167`. On verified `7c87b3c3f9`, core is `:146` and daemon `:147`; the other three anchors are unchanged. Reconcile the http-kit override at `:123–125` and the core override at `:127` so they cannot hold an old transitive artifact. Do not invent release numbers or change the admin app’s dependency for the reader tests. No Tovu API baseline delta. Before activation require the provider canaries, absence of a duplicate request marker, per-site isolation, and Chrome admin 500 ID correlation.

## P4-T3.T — Tovu — share the reporter with daemon and BYOK tools

BUILDER: OPUS

**Prerequisites and files.** Use J4’s staged daemon API and T2’s owning reporter. Edit `W/assistant/{tool-recovery-preset,byok-tool-surface}.ts`, the `agent-daemon-port.ts` public seam for any removed type there, `W/server/inbound/assistant/{agent-daemon-scope,agent-daemon-scope-tools,agent-daemon-scope-http}.ts`, and `W/server/runtime/composition/{http-app/mount-assistant,modules/assistant-byok}.ts`. Use deterministic reporter fixtures, never a production default.

**Tests first.**

- `a failed site tool shows the same ERR- id to the model and in the host log`, with tracking enabled and disabled. Mutation: build a second `createTovuErrorReporter` inside `createScopeToolExecutor` instead of using the shared one. Exercise a thrown error across the executor and disclosure boundaries with a fixture that can distinguish the two reporters’ IDs. The ID-equality assertion must go red.
- `standalone withRedactedToolFailures still redacts and stamps an id`. Assert it does not record on its own.
- Replace removed callback pins in `W/assistant/__tests__/delegated-tool-error-disclosure.test.ts:54–56,156–170` and `tool-executor-stack.failure-redaction.test.ts:154–159` with one recording reporter and ID equality. Retain audit ID, transport status, unauthorized resolve-principal refusal, and model canaries. At `tool-executor-stack.failure-redaction.test.ts:337`, assert the reporter’s host record instead of the removed `[tool-failure]` console line.
- Update the J4-affected direct fixtures in `W/server/inbound/assistant/__tests__/agent-daemon-server.typed-tools.integration.test.ts:135–136` and `W/features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts:311`. Also migrate removed tool-failure record and disclosure shapes in `W/assistant/__tests__/tool-failure-redaction.test.ts` and `W/features/deployments/__tests__/publish-agent-tools.unit.test.ts:2311`. T3b checks the full HTTP legacy-symbol inventory, including fixtures whose changes land here.

**Edit.** In `tool-recovery-preset.ts:70–113`, make `RedactedToolFailuresDeps` exactly `{ mintErrorId?: () => string }`. Remove `ToolFailureRecord` imports/exports and `failurePorts.onFailure`, including the global `[tool-failure]` sink at `:78`. Keep `withRedactedToolFailures({ inner }, { mintErrorId? } = {})` as a standalone redaction-and-stamp adapter. `describeDelegatedInternalError({ context, reporter }, { mintErrorId? } = {})` and `delegatedToolErrorDisclosure({ reporter }, { mintErrorId? } = {})` use J4’s `{ errorId, message }` result. Require `reporter` in the first object and bind `reportCancelled: true` while preserving Tovu redaction and copy. `createAssistantToolExecutor(required: AssistantToolExecutorDeps, _optional = {})` forwards the required reporter and the existing two redaction collaborators. Keep live registry, recovery approvals, and audit ports.

Add the reporter to the existing required object of `createScopeToolExecutor` (`agent-daemon-scope-tools.ts:121`). Build no reporter there. `agent-daemon-scope.ts:197,242` supplies the scope’s reporter to both tools and HTTP. `agent-daemon-scope-http.ts:198` binds disclosure and the scoped diagnostic logger on the existing HTTP deps. In BYOK, pass the website composition’s reporter through the existing `mountAssistant` → `createAssistantByokModule` → `createByokToolSurface` required bags and into the executor at `byok-tool-surface.ts:573`. Do not instantiate by turn, route, or tool. Keep `PrepareToolGuidance` at its already-landed `@jini-ai/core/contracts/site/daemon` import.

**API and cut.** No Tovu export-map, changeset or baseline delta. Use the same staged artifacts as T2. J4’s sink removal ships with T3 and the rest of the coordinated breaking cut, not on its own. No fixture retains a callback assertion for a removed sink or relies on a compatibility re-export.

## P4-T3b.T — Tovu — close the HTTP consumer-migration gate

BUILDER: OPUS

**Prerequisites.** Land after T3 and before J3a/J3b. Stage against the additive J2 HTTP reporter API and J4’s replacement tool API. The current failing gate is **31 test files and one production file**, not the six consumers in the old design.

**Tests and fixture.** Inventory with `grep -rln "reportRouteInternalError\|onInternalError" apps --include=*.ts`. Provide one shared fixture factory in `W/server/__tests__/helpers/route-incident-reporter.ts` using `createReporterRouteInternalError({ reporter: createRecordingReporter({ ids, iso }).reporter })`. The current `createRecordingReporter` requires deterministic `ids` and `iso`. Create a fresh instance per test and return the same reporter’s entries and reports for assertions. Reuse that instance wherever a failure crosses boundaries. Replace the legacy import and HTTP callback in every file in the inventory with the shared fixture, including replacements already delivered by T2/T3. Assert equivalent or stronger behavior, particularly one report, ID equality, redaction, and unchanged refusal status. Do not delete unrelated assertions.

The verified test inventory, relative to `W/`, is:

```text
assistant/__tests__/delegated-tool-error-disclosure.test.ts
assistant/__tests__/run-scoped-credential.test.ts
assistant/__tests__/theme-list-files-malformed-input-status.integration.test.ts
assistant/__tests__/tool-executor-stack.failure-redaction.test.ts
assistant/__tests__/tool-registrations.custom-credentials-egress-refusal.integration.test.ts
assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts
features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts
features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts
features/custom-credentials/__tests__/tool-registrations.model-facing-errors.test.ts
features/custom-credentials/__tests__/write-files-network-failure.model-facing.test.ts
features/forms/__tests__/agent-tools.unit.test.ts
features/forms/__tests__/common-field-tools.test.ts
features/forms/__tests__/tool-registrations.model-facing-errors.test.ts
features/fs-files/__tests__/site-folder-delegation.integration.test.ts
features/media/__tests__/view-image-tool.test.ts
features/media/__tests__/view-video-tool.test.ts
features/members/__tests__/tool-registrations.model-facing-errors.test.ts
features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts
features/post/__tests__/content-duplicate.plugin-hook-failed.test.ts
features/post/__tests__/tool-registrations.kind-status-validation-status.integration.test.ts
features/post/__tests__/tool-registrations.model-facing-errors.test.ts
features/post/__tests__/tool-registrations.optimistic-concurrency.test.ts
features/post/__tests__/tool-registrations.plugin-hook-failed.test.ts
features/web-screenshot/__tests__/tool-registrations.unit.test.ts
features/webhooks/__tests__/tool-registrations.model-facing-errors.test.ts
features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts
features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts
platform/express/__tests__/jini-routes.unit.test.ts
server/inbound/assistant/__tests__/agent-daemon-server.attachment-binding.unit.test.ts
server/inbound/assistant/__tests__/agent-daemon-server.tool-family.integration.test.ts
server/inbound/assistant/__tests__/agent-daemon-server.typed-tools.integration.test.ts
```

**Production.** The old production import and binding are in `W/platform/express/jini-routes.ts:11,192–199`. Confirm T2’s unconditional reporter-backed `daemonRouteHost` binding has replaced them. Bind the owning composition’s `{ reporter, observability }` at these seven mount seams. Thread the binding through existing registration objects, with `adapter` getting `errors`, and leave domain route deps narrow.

| Mount seam | Exact work |
|---|---|
| Capped content | `W/server/runtime/composition/modules/capped-route-app.ts:16–19` is an Express wrapper, not a direct kit mount. Pass the binding explicitly from its `modules/posts.ts:40–41,55–56,97–98` callers to `mountAdminJsonRoute`. Keep the cap before the handler in the same registration. |
| Widgets | `W/server/runtime/composition/modules/widgets.ts:72–76`, pass the adapter into `mountWidgetJsonRoute` and its kit call. |
| Forms | `W/server/runtime/composition/modules/forms-admin.ts:156`, pass the adapter into the direct submissions-pull mount. |
| Direct dev auth | `W/server/inbound/admin-http/dev-auth.ts:687–705`, bind all seven registrations: password, MFA, logout, boot session, local boot session, current user, and password status. |
| Admin JSON | `W/server/inbound/admin-http/admin-json-route-ports.ts:343–351`, forward the adapter through the existing mount, including the async-route-wrapped variant. |
| Public JSON | `W/server/inbound/admin-http/admin-json-route-ports.ts:370–376`, forward the adapter without changing visitor error copy or workspace scoping. |
| Admin and public raw | `W/server/inbound/admin-http/admin-raw-route-ports.ts:26–28,41–49,75–90`, combine errors with the host origin context for both mounts. Keep the missing-origin startup guard and the custom raw failure writer. |

Pin the actual mounting paths with the existing auth, JSON/raw envelope and registration-order fixtures. Include an oversized capped write that starts no route operation and a reporter-owned failure on the raw path. Do not turn any route into a registrar that imports a host implementation or widen a per-route deps object to `RouteDeps`.

**Exit gate.** Re-run the Tovu inventory. No retired HTTP legacy import/callback may remain. Inspect any match to distinguish unrelated callbacks, and do not widen the removal. Confirm adapter errors are wired in all seven areas and the reviewed fixture diff covers all 31 files. Stage the Tovu replacements as part of the coordinated cut before lifting J3a/J3b. No new package API or dependency beyond the staged artifacts.

## P4-J3a.J — Jini — retire http-kit legacy HTTP sinks

BUILDER: OPUS

**HOLD.** The gate is `plans/ALGO-P4-errors.md:224`. J4 must be staged, and the Tovu **P4-T3b** migration must have landed and been reviewed. Specifically verify replacement of the 31 Tovu test consumers, the production binding at `W/platform/express/jini-routes.ts:11,192–199`, and the `errors` binding at capped content, widgets, forms, dev auth, admin JSON, public JSON, and both raw wrappers. Audit Jini’s own JSON/raw fixture mounts and server examples. A clean package version or a grep count alone does not lift the hold.

**Tests first.** In `J/server/src/__tests__/route-host.test.ts`, add `route-host serves an ERR- id from the injected reporter` and `a route incident writes exactly one host record`. Mutation: leave a second default console sink. Retain J2 legacy pins on the additive cut. On retirement replace old callback pins with recording incident assertions. A JS caller without the required reporter fails at mount, not on its first request. Pin both JSON and raw ownership.

**Edit.** Delete `J/http-kit/src/internal-error.ts`, including `deliverRouteInternalError` and `logRouteInternalError`. Remove the three public exports at `index.ts:15–16`: `reportRouteInternalError`, `RouteInternalErrorContext`, and `RouteInternalErrorSink`. Keep `createReporterRouteInternalError` at the existing package root. In `adapter.ts:37` and `raw-route.ts:36`, require `adapter: RouteHostContext & { errors: RouteErrorPorts }` in the existing required object. Delete legacy exception branches once reporter mode covers both. Keep the second pad and non-incident compatibility behavior.

In `J/server/src/{route-host,compose-jini-kernel,create-local-node-daemon,mount-routes}.ts` make `CreateLocalNodeDaemonConfig.errors` required. `presetRouteHost` binds `createReporterRouteInternalError` unconditionally from the required context reporter, on the existing http-kit import edge. Preserve host context identity, origin/security settings, extension threading and overload constraints. Rebind `create-local-node-daemon.typecheck.ts:34–70`, server test hosts, `examples/minimal-host/src/index.ts:71`, and `examples/reference-web/src/daemon.ts:415` at their existing configuration objects. Use real host or recording test ports. No production default. Leave core’s deprecated shape for J3b. Add the mount why-comment explaining that missing incident ownership is a startup wiring error.

**API.** No new subpath. Add major `.changeset/http-kit-retire-legacy-route-sinks.md` and `.changeset/server-require-route-errors.md`. Update the http-kit and server API baselines. Publish only with J3b, J4 and the coordinated Tovu replacements.

## P4-J3b.J — Jini — retire core legacy HTTP sinks

BUILDER: OPUS

**HOLD.** Stage J4 and J3a only after the P4-T3b consumer gate has cleared. Do not execute J3b against an unmigrated Tovu host. Reuse the named server pins `route-host serves an ERR- id from the injected reporter` and `a route incident writes exactly one host record`. Add the Fetch equivalent, a runtime check for a JS caller missing errors, and first/second record assertions. Mutations leave a second legacy sink or allow the host to mount silently without errors.

**Files and edit.** `J/core/src/contracts/server/{json-route.ts,testing.ts,__tests__/json-route.test.ts}`, the existing `contracts/server.ts` barrel, `J/daemon/src/http/{route-table,route-host}.ts` where the host type is narrowed, and their affected fixtures. Remove `RouteHostInternalErrorContext`, `RouteHostContext.onInternalError`, `legacyAnswer`, and the legacy exception branch. Require `RouteHostContext.errors`. Preserve the two-object API `jsonRoute({ spec, deps, reportInternalError }, { host })` with `host` required at the public type boundary. A missing `host.errors` must fail at mount with exactly `Pass errors: { reporter, observability } when mounting JSON routes.` Retain the SEC-005 why-comment next to the surviving incident classification.

Keep `ReportRouteInternalError` generic as `(required: { report: E; logSource: string; message: string }, _optional?: Empty) => ServerApiError`. Its implementation still defaults the pad to `{}`. Update `createTestRouteHost` and callers with recording ports. Do not replace any retired symbol with a shim.

**Guard and API.** Design guard I3.4 is exactly:

```sh
git grep -c onInternalError -- packages/{core,http-kit}/src ':!**/__tests__/**'
```

Require **zero matches**. With no matches `git grep` prints no counts and exits 1. A match or a command error does not pass the guard. Keep this scoped to core/http-kit runtime source and do not remove independent callbacks elsewhere. Use the existing `./contracts/server` export. Add major `.changeset/core-retire-legacy-route-sinks.md` and update `api-baseline/jini-ai__core.json`. Publish J3a/J3b with J4, T2 and T3 as one coordinated breaking cut.

---

**P4-T4 — NOT-SHEETED.** Mark the four stale `INDEX.md:48–51` rows `P4-T4-R`, `P4-T4-1`, `P4-T4-2`, and `P4-T4-3` as `LANDED 04d030b5a; Opus regression reconcile only`. Do not replay the landed R/A/S/B/D/C/O/I/T/H/P batches. Opus owns the merge-13 `(rule, path)` baseline, rename-normalized comparisons for `ex5-fnd-kit-tovu`, `ex5-fnd-seams-tovu`, `ex5-fnd-inject-tovu`, and `ex4-media-tovu`, and the merge-21 strict gate. If a new regression is found, sheet only that row against its current owner with the original behavior and size rule. The surviving sheet-I pin is `W/platform/db/repos/__tests__/media-repo.transform-conflict.test.ts:8`. P6 and P10 consume the landed behavior.
