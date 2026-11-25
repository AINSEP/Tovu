SHEETS r62t-sheet-p4 PARTIAL: 10 sheets (6 Jini / 4 Tovu), 4 moved anchors, 2 gone

Verified against Tovu `caa3ac7811` and Jini `dc2349f51`, both at `origin/integ/merge-21-2026-11-24`. No files changed, and no tests, builds, installs, or type-checks ran. Lookups stayed below 220. `AI-Dev-Shop` and the named ADS-memory architecture files were unavailable in this clone. I used the dispatch’s bootstrap exception and the supplied plan refs.

**Release blocker.** J3’s consumer gate is red. The design names five Tovu test consumers, but merge-21 has **30 test files plus the production `jini-routes.ts`** referencing the legacy symbol or callback. More importantly, Tovu now mounts routes through central JSON and raw wrappers that do not consistently supply a route reporter. J3’s removal sheets are written below, but neither may be executed until those consumers have a reviewed replacement. T4 is already landed and is **NOT-SHEETED** for new implementation.

## Anchor table

Paths are at merge-21 unless noted. `J/` is Jini `packages/`. `W/`, `A/`, and `D/` are Tovu `apps/website/src/`, `apps/admin/src/`, and `apps/desktop/src/`.

| Step | Current anchors and disposition |
|---|---|
| J1 | `J/core/src/errors/reporter.ts:157–169` refusal selection, `:171–182` catalog refusal. `J/core/src/errors/catalog.ts:13–31,111–117,172` contract, built-in match, and factory. `J/core/src/errors/__tests__/reporter.test.ts:243–283`, including the authorized-audience pin at `:278`. `.changeset/core-error-reporter-contract.md` is absent as expected and is a create. Exact text is at plan-ref `inputs/r62t-left.md:44–57`. |
| J2 core | `J/core/src/errors/reporter.ts:42–76,110–149,185–239` options, incident record, describe, and operation runner. `J/core/src/contracts/observability.ts:42–60,70–82,143–153` attributes, operation contracts, and existing no-op implementation. `J/core/src/contracts/server/json-route.ts:73–114,129–149,194–219,221–305` host contract, `ClientFacingError`, fetch route, gates, and failure paths. Server barrel is **`J/core/src/contracts/server.ts:130`**, not `server/index.ts`. `request-body.ts:12–20` is the fetch 413 path. `__tests__/json-route.test.ts:114` pins host policy. |
| J2 Express and bridge | `J/http-kit/src/adapter.ts:37–95,150–160,183–222,240–289`. `onReturnedError` is already present, with parse/handle phase, at `types.ts:21–29` and `adapter.ts:240–253`. There are **two Express 413 paths**: the upstream middleware at `middleware.ts:23–35` and the in-route cap at `adapter.ts:150–160`. Raw mounts share exception handling at `raw-route.ts:36–65`. `node-bridge.ts:46–64,302–332,345–376,405–432` owns 12-hex refs and dispatch/write failures. Pins are in `http-kit/src/__tests__/{adapter,adapter-pins,node-bridge,raw-route}.test.ts`. |
| J2 preset | `J/server/src/create-local-node-daemon.ts:124,360–389,493–531` config, extension, overloads and adapter construction. Kernel uses that adapter at `compose-jini-kernel.ts:115–118,412`. `route-host.ts:10,34–48` binds the old implementation. `mount-routes.ts:32–39` creates the server’s node dispatcher. `J/daemon/src/http/route-table.ts:52–60` forwards `host.context`. `J/server/src/__tests__/route-host.test.ts:34–45,48–57,86–97` pins context identity, parser ceiling, and legacy sink. |
| J3 | Core removal points `J/core/src/contracts/server/json-route.ts:73–100,288–305`. http-kit removals `J/http-kit/src/internal-error.ts:1–66`, `index.ts:15–16`, `adapter.ts:256–289`. Server preset binding above. Tovu production binding at `W/server/runtime/composition/jini-routes.ts:11,192–199`. Original test pins still exist at `W/server/runtime/composition/__tests__/jini-routes.unit.test.ts:132`, `W/server/inbound/assistant/__tests__/agent-daemon-server.typed-tools.integration.test.ts:136`, `W/assistant/__tests__/delegated-tool-error-disclosure.test.ts:54`, `W/assistant/__tests__/tool-executor-stack.failure-redaction.test.ts:159`, and `W/features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts:311`. Newly found examples include `W/assistant/__tests__/run-scoped-credential.test.ts:22,390–407` and `W/server/inbound/assistant/__tests__/agent-daemon-server.attachment-binding.unit.test.ts:22,103`. |
| J4 daemon HTTP | Under `J/daemon/src/http/`, legacy seam anchors are `attachment-lookup-routes.ts:26,71–99`, `attachments.ts:188,219`, `connectors.ts:132,164`, `db-ops.ts:214,239`, `delegated-tools.ts:84–98,114,157,213–235,307–331,380–384`, `media.ts:164,179`, `memory.ts:145,191`, `model-proxy.ts:145,352–438,556–611`, `remote-run-events.ts:53,226`, `research.ts:88,160,243`, `runs.ts:61,83–92`, `terminals.ts:76,92–100`, `tool-execution-routes.ts:68,88,168–203`, `xai.ts:200–257`. The model proxy has **fixed-provider and catch-all** paths. Test owners are `http/__tests__/model-proxy.test.ts` and `delegated-tools.test.ts`. |
| J4 tools | `J/daemon/src/tool-recovery/observability.ts:24,42–69,80–111`, `stack.ts:57–95`, `redaction.ts:45–71,79–98,119–168,179–224,240–251`, `recovery.ts:408,494–end`, `index.ts:1–8`. Tests in `tool-recovery/__tests__/{observability,stack,forced-confirmation-forwarding}.test.ts`. The current delegated route records **before** calling its wording port at `delegated-tools.ts:228–234`. Replacing the wording callback with a recorder without changing that order would double-report. |
| J5 | `J/sidecar/src/json-ipc.ts:41–85,163–178,196–220,246–355,356–393,482–486,539–543`. Wire and transport pins in `J/sidecar/src/__tests__/json-ipc.contract.test.ts:66–354`. `D/main/boot/site-backend.ts:100,120,148,188` is the site-backend startup seam, not an existing `createJsonIpcServer` binding. Desktop IPC adoption remains deferred. |
| T1 | `W/server/inbound/assistant/agent-daemon-server.ts:36–64`, specifically the surviving `.catch` at `:54`. Fixture `W/server/runtime/composition/__tests__/process-root-parity.test.ts:401–443`, `new Function` at `:423`. `J/core/src/errors/idioms.ts:32–34`; Tovu already consumes this subpath at `W/assistant/site/visitor-tool-budgets.ts:4,54`. |
| T2 reader | **MOVED 1.** `A/lib/admin-failure-channel.ts:128–142`’s decoder/publisher logic is now `J/admin/src/shell/lib/admin-failure-reporter.ts:165–205`; Tovu binds it at `A/lib/admin-failure-channel.ts:9,21–31`. The nested decoder is `J/protocol/src/errors.ts:90–122`. **GONE 1.** `A/lib/__tests__/admin-failure-channel.test.ts` is not a current file. STOP targeting that filename. Use `A/lib/__tests__/admin-failure-channel.unit.test.ts:16–24` and the real transport characterization at `A/lib/__tests__/api-request.characterization.test.ts:186–189`. Jini’s separate disclosure tests live in `J/admin/src/shell/lib/__tests__/admin-failure-reporter.unit.test.ts:26–96`. |
| T2 incident and tracker | `W/server/inbound/shared/admin-failure.ts:32,39–64,71–99,115–134`. **C115 is already landed** at `:75–82`; backup-route regression at `W/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts:33`. **GONE 2.** `W/server/inbound/shared/__tests__/admin-failure.unit.test.ts` does not exist. STOP looking for the old fixture. Add it for the pure lifecycle pins and use the existing real-tracker integration at `W/server/inbound/shared/__tests__/observability-error-report.test.ts:48–177`. **MOVED 2.** `Tracker.error` now lives at `J/core/src/contracts/site/diagnostics-observability.ts:49`, from `J/diagnostics/src/observability/tracker-types.ts:49`. Implementation is `J/diagnostics/src/observability/tracker.ts:66–83` and `report-error.ts:63–103`. Existing Tovu redactor is `packages/contracts/src/diagnostics-redaction.ts:25–28`. Core formatter’s cause-ID precedence is `J/core/src/user-facing-error.ts:34–42`. |
| T2 host | Website `W/server/runtime/composition/app.ts:419–456`; old admin-only binding `:431`. Public request scope `W/server/runtime/composition/http-app/public-middleware.ts:39,54` and `W/server/inbound/shared/observability-middleware.ts:69–115,119–145`. Admin/public JSON mounting and error policies `W/server/inbound/admin-http/admin-json-route-ports.ts:230–233,244–255,303–319,343–376`; raw wrappers `admin-raw-route-ports.ts:47,75`; direct dev-auth mounts `dev-auth.ts:687–705`. Daemon entry `agent-daemon-server.ts:190–211,254`; scope `agent-daemon-scope.ts:145–149,197,242`; scope host `agent-daemon-scope-http.ts:63–77`. Per-site tracker exported by `W/server/runtime/composition/agent-daemon-core-deps.ts:44,87`. Desktop HTTP host `D/desktop-agent.ts:384–403,491–507`, called from `D/desktop-chat-main.ts:57–59`. Tovu node bridge `W/server/runtime/composition/jini-routes.ts:29–39,88–92,192–199`. |
| T3 | `W/assistant/tool-recovery-preset.ts:12–17,70–78,90–113`, `W/server/inbound/assistant/agent-daemon-scope-tools.ts:121–139`, scope executor and HTTP call sites above, `agent-daemon-scope-http.ts:184–220`, `W/assistant/byok-tool-surface.ts:409–414,573,776`, `W/server/runtime/composition/modules/assistant-byok.ts:516–549`, `http-app/mount-assistant.ts:21–27`. **MOVED 3.** `PrepareToolGuidance` moved from old `J/daemon/src/tool-executor-types.ts:131` to `J/core/src/contracts/site/daemon.ts:16`. The Tovu preset already imports it there at `:100`. |
| T4 | `04d030b5a9` is the landed R/A/S/B/D/C/O/I/T/H/P change. A surviving I pin is `W/platform/db/repos/__tests__/media-repo.transform-conflict.test.ts:8`; the repo is still `W/platform/db/repos/media-repo.ts`. The comparison refs resolve as `ex5-fnd-kit-tovu` `541537de6f`, `ex5-fnd-seams-tovu` `63b09af263`, `ex5-fnd-inject-tovu` `6f571e3d00`, `ex4-media-tovu` `a10a60efc3`, under `origin/codex/`. Gate entry points are Tovu `package.json:67,83`. |
| T5 | Legacy alternate arm `W/server/inbound/shared/admin-failure.ts:58–63`; independent unreported-5xx marker `observability-middleware.ts:119–131`. **MOVED 4.** Browser telemetry from `W/server/inbound/admin-http/routes/system/browser-telemetry.ts:112` to `J/cms/src/admin-http/routes/system/browser-telemetry.ts:126–155`. Tovu mounts it at `W/server/runtime/composition/modules/system-telemetry.ts:29–41`; browser coverage remains in `W/server/inbound/admin-http/routes/system/__tests__/browser-telemetry.unit.test.ts:98–149`. Detached reporting consumers at `W/server/inbound/public-http/routes/members/sign-in.ts:49–66` and `W/server/runtime/composition/modules/members.ts:149–167` are not covered by request locals. |

## Build sheets

**Conventions.** In signatures below, `Empty` means `Record<string, never>` and an unused second object is `_optional: Empty = {}`. Keep both args objects on public factories, the existing why-comments, and the 80-line and complexity-10 limits. No new Jini-to-Jini runtime implementation dependency. New cross-package collaborators are values the host binds, using core types for the contracts. Preserve K1 route specs, host wire shapes, mount ordering, and existing auth gates. No P4 sheet adds persisted state, a user data deletion, or a schema migration. If an executor discovers one is required, STOP that expansion. Any separately approved migration must use ADR-066 TypeScript migrations, pinned checksums, and journal `when` equal to the previous value plus one.

**Review order.** Stage J1 → J2 → J4 and J5. Stage J3a → J3b only after the consumer gate is satisfied. T1 is independent. Prepare T2/T3 against the staged Jini API before the breaking release, then consume the coordinated release and run T5. A Jini commit being ready is not permission to publish an incompatible release before its host replacements are ready.

### P4-J1.J — Jini — refusal disclosure and L6 artifact — OPUS-CHECK

**Files.** Change `J/core/src/errors/reporter.ts` and `errors/__tests__/reporter.test.ts`. Create `.changeset/core-error-reporter-contract.md` with this exact content.

```md
---
"@jini-ai/core": major
---

Update the error reporter to use the observability port and report incidents with their error ID, label, operation, and tracker trace IDs. Read `OperationTracker.traceIds()` when the tracker provides it. Incident replies include the recovery action, and caller-facing refusals use the supplied fallback for `own-message` bindings.

Replace `ErrorReporterPorts.tracker` with `observability: Pick<ObservabilityPort, 'reportError'>`. Pass `operation` and `tracker` to `describe`, and pass `operation` to `record`. To bracket a unit of work with one operation tracker and one failure report, use `runOperation`.

`IncidentTrackerReport` and `createRecordingTracker` have been removed. Use `ErrorReport` from `@jini-ai/core/contracts/observability` and `createRecordingObservability` from `@jini-ai/core/errors/testing`. `createRecordingReporter().reports` now contains `ErrorReport` entries.
```

**Test first.** `an own-message match carrying a canary message answers the fallback words`. Inject a catalog that sets `message` on an `own-message` match. Assert fallback, original refusal code, and no incident. Mutation: use `match.message ?? fallback.message` in that arm. Retain the existing authorized-only sentence pin at `:278`.

**Edit.** Add private `refusalMessage(required: { match: ErrorMatch; fallback: { message: string }; audience: ErrorAudience }, _optional: Empty = {})` returning `{ kind: 'text'; message: string } | { kind: 'sentence'; sentence: NonNullable<ErrorMatch['sentence']> }`. Check audience before switching. `own-message` always falls back, `fixed` uses fixed copy or fallback, `sentence` requires a sentence. Use an exhaustive switch. Keep `refusalError`’s input and wire shape, and leave parameter redaction and interpolation there. Add the why-comment beside `own-message` that injected catalogs may supply the original exception text.

**API.** No export or baseline delta for the split. Opus checks complexity and L6 release coverage. The artifact mutation is removing this exact changeset against the pre-break baseline. Merge-21’s current baseline may already include those API changes, so a green artifact-deletion run against that baseline alone would not prove coverage.

### P4-J2.J — Jini — additive HTTP reporter mode — OPUS-CHECK

**Files.** Core `errors/{reporter.ts,__tests__/reporter.test.ts,__tests__/boundary.test.ts,README.md}`, `contracts/server.ts`, `contracts/server/{json-route.ts,client-facing-error.ts,__tests__/json-route.test.ts}`. http-kit `src/{adapter.ts,raw-route.ts,origin.ts,node-bridge.ts,index.ts,reporter-internal-error.ts}` and the four test files in the anchor table. Server `src/{route-host.ts,mount-routes.ts,compose-jini-kernel.ts,create-local-node-daemon.ts,__tests__/route-host.test.ts}`. Preserve the landed `onReturnedError` and optional `entityType`/by-ID authorize forwarding. Do not reapply the old foundation branch over the current adapter.

**Tests first.** Run the same counting contract through Fetch and Express where applicable. Fakes use a real reporter with recording logger and tracker, plus a legacy sink spy.

| Exact design test name | Pin or mutation |
|---|---|
| `a throwing route with a reporter returns one ERR- id that matches the single host record and the single tracker report` | Mutate by minting a second ID or recording a second incident. |
| `one http.route operation per request, attribute http.route is the pattern` | `/runs/abc?x=1` against `/runs/:id`. Mutate by using the actual URL. Pin success and end-before-normal-write. |
| `a returned refusal ends the operation as refused with no report` | Parse, handle, Fetch 413, and Express in-route 413. Mutate by dropping `classify`. Preserve the Express `parse`/`handle` phase. |
| `a thrown ClientFacingError is refused at its own status with no id` | Keep safe words and no report. |
| `ports.onError answers before the reporter and the reporter records nothing for it` | Count calls to the boundary reporter, not records a host policy intentionally owns. |
| `a throwing onError still answers with the original failure's id and records the policy failure separately` | Distinct errors, IDs, and records. If headers are sent, one record per error and no second response. |
| `without errors the legacy path still answers with requestId and calls onInternalError` and `with errors, a passed onInternalError is never called` | Mutate by invoking both sinks. |
| `a disconnected client gets no write, the operation ends cancelled, nothing is reported` | Returned disconnect and thrown abort-like error. A non-abort throw after disconnect is still an incident, with no write. |
| `a tracker whose end throws leaves a successful request answered 200 with zero reports` | Mutate by putting `end` inside the work `try`. Also cover a throwing `trackOperation` and a throwing reporter. |
| `a route that returns the reporter-backed INTERNAL_ERROR ends failed with exactly one report` | Mutate by reporting again in the classifier. |
| `an oversized Express body never starts an http.route operation` | Exercise the upstream body parser, not the in-route cap. |

Add a bridge pin for an unhandled failure without Express `next`, one for a post-header write failure, and retain `next(error)` before headers. Add a raw-route pin for reporter mode and a partial stream failure. Add core pins for same-object reuse, independently created reporters, primitive limits, and rejected or throwing diagnostics ports.

**Core contracts.**

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
  optional: DescribeFailureOptions & {
    onReporterBreach?: (required: { operation: string }) => void
  } = {},
): Promise<
  | { ok: true; value: T; verdict: OperationVerdict }
  | { ok: false; failure: DescribedFailure; verdict: OperationVerdict }
  | { ok: false; cancelled: true; verdict: OperationVerdict }
>
```

`settle` is only for cancellation in this feature. The explicit cancelled arm avoids inventing an incident or making callers dereference a nonexistent `failure`. Update existing boundary tests to narrow it. Export `startOperation({ observability?, name, attributes? }, _optional = {})`, `endOnce({ tracker, verdict }, _optional = {})`, and `NOOP_OPERATION_TRACKER` from `errors/reporter`. `startOperation` contains a broken port, `endOnce` is invoked once outside the work catch. Never retry the handler because a tracker failed. On a reporter breach return the fixed fallback and `UNAVAILABLE_ERROR_ID`. If injected, call the breach hook with fixed metadata only. Core must not write to a Node or vendor sink.

Add `attributes?: OperationAttributes` to `DescribeFailureOptions` and `RecordFailureOptions`. Forward accepted attributes to host `meta.attributes` and `ErrorReport.context.attributes`. Accept only known fixed fields and bounded values. Strings use `^[\w.:/-]{1,128}$`; numeric scalars must be finite. The regex is not a redactor. Reject raw URLs, query strings, body fields, tokens, and free-text metadata at the origin. Use the spec’s literal registered pattern for span attributes. The incident owner does dedupe before minting. A per-reporter `WeakMap<object, string>` gives a second crossing of the same error object its first ID without logging again. `describe` still classifies refusals first and respects a supplied already-recorded ID. Primitives are not deduped.

Move `ClientFacingError` and its SEC-005 explanation verbatim to `client-facing-error.ts`. Re-export from the **existing public server barrel** only. Import the leaf from the reporter and Fetch route. Opus runs the runtime-cycle guard before and after. No Express or `node:*` in core.

**Binding and flow.** Core adds `RouteHostContext.errors?: RouteErrorPorts`. The port holds `{ reporter: ErrorReporter; observability: Pick<ObservabilityPort,'trackOperation'>; runOperation: typeof runOperation; onReporterBreach?: … }`. The runtime entry is injected into http-kit and sidecar, not imported there. Core can call its own runner. Add http-kit `createReporterRouteInternalError({ reporter }: { reporter: Pick<ErrorReporter,'record'> }, _optional: Empty = {}): ReportRouteInternalError`, exported from the existing root. Its closure keeps the current generic required `{ report, logSource, message }` and compatibility second object. It ignores legacy options in reporter mode, records once with `operation: 'http.route'`, copies only fixed `runId`, `batchId`, `source`, `provider`, `operation` fields, and returns `INTERNAL_ERROR` with the same ID in `requestId` and plain words.

The host supplies `errors?: RouteErrorPorts & { reportInternalError: ReportRouteInternalError }` in the preset’s existing config object. Both preset overloads preserve their pack/bindings constraints and take `_optional = {}`. Add `presetRouteHost({ context, parserLimitBytes, reportInternalError? }, _optional = {})` and thread the bound port through the existing kernel and extension args. Leave the existing legacy implementation only in the no-errors branch. Do not introduce a server runtime import of the new http-kit factory. Forward the same reporter to the existing server dispatch mount.

- **Fetch.** Select reporter mode once when creating the route. Keep raw read → workspace → origin → authenticate → parse → handle. Use `answerJsonRoute`, `legacyAnswer`, `tracedAnswer`, `routeAnswerTagged`, `verdictFor`, `hostPolicyAnswer`, and `failureResponse`. Tag refusals from typed results, not by parsing serialized bodies. End with `http.method`, `http.route`, and outcome attribute `http.status_code`. Use the existing Fetch 499 sentinel with no body for cancellation. The transport must not write it to a disconnected peer.
- **Express.** Keep the response-close abort listener and its `finally` cleanup. `serveExpressRoute` returns `{ write, verdict }` for ordinary adapter-owned writes. Calculate the body-cap and origin decisions without writing on the reporter path, then apply the original response/header writers. Preserve any explicit `RouteReply` status and body and classify its status. Classify before the landed `onReturnedError` callback shapes the wire. The existing write-style `onError` is an exception to end-before-write: call it once, then classify actual status. If it throws, record that separate policy failure and handle the **original** error. A sent header forbids a second reply. Destroy if needed after recording. A write-closure failure goes to the transport record, not another operation or another handler call.
- **Raw.** Thread the same mounted reporter into `mountRawRoute` and its exception/write paths. Start the span around route execution, not stream drain. Preserve deferred body read, response headers/cookies, and gate order. Record a non-disconnect stream write failure once and close.
- **Node bridge.** Add `reporter?: Pick<ErrorReporter,'record'>` to the existing `NodeDispatcherOptions` second object. Pick a ref source once. Keep pre-header Express `next(error)` delegation without first recording. Without `next`, record and use the ERR ID in the existing plain response. After headers, record and destroy, never write a second response. Keep 12-hex refs only without the injected reporter. Do not add a second HTTP span for a bridge that is forwarding a traced route.

Use the design’s generic HTTP fallback: “The server could not finish this request.” and “Check whether your change was saved, then try again. If it keeps failing, report the error ID.” Add why-comments on policy precedence, pattern-only attributes, response-close versus request-close, and who owns writes. Create core `errors/README.md` with Wiring, port ownership, binding example, and ADR-071. Describe where an operator-only record and an exported tracker record differ.

**API.** Keep existing `./contracts/server`, `./errors/reporter`, http-kit `.` and `./node-bridge`, and server `.`. No package.json export-map delta. Add `.changeset/core-route-operation.md`, `.changeset/http-kit-route-reporter.md`, `.changeset/server-route-reporter.md`, each minor. Opus reviews generated `api-baseline/jini-ai__{core,http-kit,server}.json` and checks the new cancellation arm explicitly. The API gate does not fail on signature-only changes.

### P4-J4.J — Jini — daemon route and tool incident ownership — OPUS-CHECK

**Files.** Edit the 15 daemon HTTP files enumerated in the anchor table, plus `tool-recovery/{observability,stack,redaction,index}.ts`, the package HTTP/type surface that declares the changed contracts, and the referenced tests. Include `forced-confirmation-forwarding.test.ts` and all affected fixture construction sites. Do not remove unrelated `onInternalError` callbacks in `run-lifecycle{,-timers}.ts`, `agent-executor/event-cleanup.ts`, or `tool-recovery/federated-refusal.ts`.

**Tests first.**

- `an internal failure gives one report tagged with the result's id and end({ failed: true })` — minting a second ID makes it fail.
- `a ToolInputError gives zero reports` and `a validation failed result gives zero reports`.
- `with observability disabled a failed tool still writes one host record` — restoring the noop skip makes it fail.
- `the report carries the operation tracker's trace ids` — remove the explicit tracker and report only inside `tracker.run`.
- `one id in model text, audit row and host record for a failed tool`.
- `a thrown tool error answered by the delegated route keeps the decorator's id and is reported once` — remove dedupe and expect red.
- `a timed-out tool answered by the delegated route is reported once with one id`.
- `model-proxy upstream failure returns plain words and an ERR- id, no upstream text`.

Extend the last two pins to assert both wire ID locations and one host record. Cover the fixed-provider and catch-all proxy paths, failures after SSE starts, nested failure, and a retry preserving the final attempt’s ID. Use a fake `traceIds()` sentinel rather than a vendor SDK.

**Contracts and wiring.** `createAssistantToolExecutor(required: AssistantToolExecutorDeps, _optional = {})` keeps its existing recovery, registry, surface, audit, and ID ports. Replace `toolFailures` with `{ mintErrorId: () => string; redactSecretShapes: existing signature }`; add required `reporter: Pick<ErrorReporter,'record'>` and `operation: { startOperation: typeof startOperation; endOnce: typeof endOnce }`. Remove `ToolFailureRecord`, `onFailure`, `safeOnFailure`, and their barrel/type references. Use the same reduced redaction deps on `redactFailedResult` and `withRedactedToolFailures({ inner, mintErrorId, redactSecretShapes }, _optional = {})`.

```ts
withToolCallObservability(
  required: {
    inner: ToolExecutor
    reporter: Pick<ErrorReporter, 'record'>
    operation: ToolOperationPorts
    observability?: Pick<ObservabilityPort, 'trackOperation'>
      & Partial<Pick<ObservabilityPort, 'metric' | 'supportsMetric'>>
  },
  optional: {
    isRegisteredTool?: IsRegisteredTool
    observabilityEnabled?: () => boolean
  } = {},
): ToolExecutor
```

Install the decorator unconditionally. The observation predicate controls real spans and metrics, not records. Start with the injected lifecycle port or its no-op path. Keep execution purposes intact: read-only enforcement → redaction → operation/report → audit → recovery, from inner to outer. Isolate `settleThrownToolCall`, `settleToolResult`, `reportNestedFailure`, and metric settlement. Report an internal throw with its original object and explicit tracker, then rethrow unchanged. Record a failed internal result under `readToolErrorId({ result })`; wrap only already-redacted text for this record. On timeout, record once and stamp `errorId` on the returned result. Denied, cancelled, and validation results do not record in the decorator. Keep existing status labels and metrics. If the reporter breaches, the failure or throw still passes through. Nested calls bypass the decorator, so the nested-failure hook redacts, stamps, and records once, with the enclosing context if available. Pin the final retry result, not just the intermediate redacted one.

**Delegated route seam.** Add `errorId?: string` to the description context and forward it for timed-out and failed results. `isRedactedToolFailure` requires both `status === 'failed'` and an ID. Keep the 422 model-safe result path and its `Error <ID>: <redacted reason>` words. For the **500 path**, do not leave the current report-then-describe sequence with two recorders.

Use an injected disclosure result `{ errorId: string; message: string }` at this seam, from `delegatedToolErrorDisclosure({ reporter, mintErrorId, redactSecretShapes, reportCancelled: true }, _optional = {})`. `describeDelegatedInternalError({ context, reporter, mintErrorId, redactSecretShapes, reportCancelled }, _optional = {})` returns that result. For an already stamped result, reuse the trusted in-process ID without recording. For an unstamped error, record through the same reporter. An object throw already seen at the decorator reuses its ID through dedupe. If the wording port is absent or fails, the route uses the same stamped ID if present, otherwise calls its existing injected `reportInternalError` once. Never accept a client-supplied incident ID as proof of a record. Remove the legacy `correlationId` from the migrated description contract and records. The returned wire `requestId` and the displayed ID must be identical. Opus checks the observer failure and timeout/cancellation cases most closely.

Strip the legacy optional sink from the listed daemon route deps and from the second args at reporter calls. Keep existing two-object pads at public functions. Keep SEC-005 safe words and gate order. In the proxy, return the reporter’s `requestId` as the SSE error `code` and use only `PROXY_STREAM_STOPPED_MESSAGE`. Do not forward event or upstream exception text. Update comments in affected route docs and server OpenAPI files that still describe the removed sink. Add why-comments for recording when tracing is disabled, trusted reuse of stamped IDs, and why recovery stays outside the per-attempt decorator. P10-O2 counters are follow-up work.

**API.** Existing `@jini-ai/daemon/{http,tool-recovery}` subpaths only. `.changeset/daemon-route-tool-reporter.md` major and Opus update of `api-baseline/jini-ai__daemon.json`. The J4 removal belongs to the same release as J3 and Tovu’s replacement wiring. Do not release an interim build in which the tools have no recorder.

### P4-J5.J — Jini — additive sidecar IPC reporter mode — OPUS-CHECK

**Files.** `J/sidecar/src/json-ipc.ts`, `src/types.ts` only for a shared wire type if needed, `src/__tests__/json-ipc.contract.test.ts`, and sidecar README/API spec. Keep the existing root entry point.

**Tests first.** `a handler throw yields one report and the ERR- id in requestId`; `without errors the legacy reply keeps traceId as requestId and logs once`; `the ipc.method attribute is the bounded label, never message text`; `a peer gone before the reply produces no second incident`; `HANDLER_ERROR code is kept in reporter mode`. The named mutation restores the legacy unconditional console record in reporter mode. Add a refusal assertion for reason without `requestId`, a success assertion, and preserve oversized/idle frame tests. Rescreen the visible `ex-env*` refs for overlap before implementing. No unseen branch is assumed reconciled.

**Edit.** Keep `createJsonIpcServer({ socketPath, handler }, optional = {})`. Extend the existing optional bag with:

```ts
errors?: {
  reporter: ErrorReporter
  runOperation: typeof runOperation
  observability?: Pick<ObservabilityPort, 'trackOperation'>
  methodOf?: (required: { message: unknown }) => string | undefined
  refusalCode: 'HANDLER_ERROR'
}
logger?: Pick<Logger, 'error' | 'warn'>
```

Choose mode at setup. Thread one `IpcFailurePorts` object through `bindJsonIpcSocket`, its data/frame helpers, and dispatch. Derive `ipc.method` only from the validated host label and `/^[a-z][\w.:-]{0,63}$/i`, otherwise `unknown`. Contain a throwing label function. Never use the raw message summary, arbitrary input keys, or socket path as operation attributes. Keep generated `ipc.trace_id` distinct from the incident ID.

In reporter mode run one `ipc.handle` operation, with the IPC fallback from the design, around handler execution and success serialization. Serialize before considering work successful so an unserializable result is an incident, not a peer disconnect. End before writing. Failures keep `HANDLER_ERROR`; incidents include the ERR ID in words and `requestId`, refusals include `reason` and safe refusal words, but no ID. Carry optional `reason` through the client’s parser and `ipcResponseError` without changing `code`. `safeEnd({ socket, frame, logger }, _optional = {})` contains a sync write failure or a gone peer and warns with fixed metadata only. No new incident. Gate tracing as today, use the injected logger for server trace events, and omit raw handler summaries or error text on the reporter path. Preserve legacy defaults when `errors` is absent, including the old trace ID and one unconditional incident write. Keep comments explaining SEC-004 frame claiming and the trust boundary.

**API.** Sidecar root only, no manifest export-map change. `.changeset/sidecar-ipc-reporter.md` minor and `api-baseline/jini-ai__sidecar.json` review. No production desktop injection in this sheet. The Electron check is owed after adoption.

### P4-J3a.J — Jini — retire http-kit legacy HTTP sinks — OPUS-CHECK — HOLD

**Entry gate.** Inspect both replacements, not just package versions. On Tovu, the release diff must cover every import of `reportRouteInternalError`, every HTTP `onInternalError` callback, and every mount that would now be required to supply errors. Audit Jini’s own raw and JSON fixtures and server examples too. In particular the Tovu direct dev-auth mounts and the central JSON/raw mount wrappers must have a reviewed migration. **Current gate result: STOP.** The 30 test files and the mount fan-out are not the six-file inventory in the design. A grep result is not permission to mechanically remove callbacks or change error envelopes.

**Tests first.** `route-host serves an ERR- id from the injected reporter` and `a route incident writes exactly one host record` in `J/server/src/__tests__/route-host.test.ts`; reuse them for J3b. Mutation: leave a second default console sink. Keep the legacy tests on J2’s compatibility commit, then replace callback pins with recording-reporter pins when retiring storage of the callback. Assert startup failure for a missing required reporter on a JS caller.

**Files and edit.** Remove `J/http-kit/src/internal-error.ts` and its three public exports from `src/index.ts`. Change `adapter.ts` and `raw-route.ts` to require `adapter: RouteHostContext & { errors: RouteErrorPorts }` in the existing required mount object, with the second pad unchanged. Delete their legacy exception branch only after reporter mode covers raw as well as JSON. Keep the shared reporter factory and its existing subpath. In `J/server/src/{route-host,compose-jini-kernel,create-local-node-daemon,mount-routes}.ts`, remove the old http-kit binding and require the already-bound `reportInternalError` port. Make `CreateLocalNodeDaemonConfig.errors` required. Preserve origin/security config, extension context identity, and overload constraints. Patch `create-local-node-daemon.typecheck.ts:34–70`, server test hosts, `examples/minimal-host/src/index.ts:71`, and `examples/reference-web/src/daemon.ts:415` at their existing config objects. Use real host-provided ports or recording test ports, never a hidden production default. Leave core’s deprecated shape until J3b.

**API.** No new subpath. Add `.changeset/http-kit-retire-legacy-route-sinks.md` and `.changeset/server-require-route-errors.md`, both major. Update the http-kit and server baselines in Opus. Add the why-comment at the mount assertion that missing incident ownership is a startup wiring error, not a request-time choice.

### P4-J3b.J — Jini — retire core legacy HTTP sinks — OPUS-CHECK — HOLD

**Predecessors.** J4 and J3a must be staged and the Tovu replacements reviewed. Test first with J3a’s named pins, plus the same Fetch mount failure and first/second record assertions. Mutation: leave a second legacy sink or allow a missing host to mount silently.

**Files and edit.** `J/core/src/contracts/server/{json-route.ts,testing.ts,__tests__/json-route.test.ts}`, `contracts/server.ts` if an export needs updating, daemon `http/{route-table,route-host}.ts` where their existing host types narrow, and affected test helpers. Remove `RouteHostInternalErrorContext`, `RouteHostContext.onInternalError`, `legacyAnswer`, and the old exception path. Require `RouteHostContext.errors`. Preserve the outer `jsonRoute` two-object API as `jsonRoute({ spec, deps, reportInternalError }, { host })`, with `host` required at the type boundary. If retaining a default on the implementation for JS validation, make the public overload required and reject missing errors at mount with `Pass errors: { reporter, observability } when mounting JSON routes.` Keep `ReportRouteInternalError` generic as `(required: { report: E; logSource: string; message: string }, _optional?: Empty) => ServerApiError`. The implementation still defaults `_optional = {}`. Update `createTestRouteHost` and callers with recording ports. Do not replace the deleted symbol with a shim. Keep the SEC-005 why-comment next to the surviving incident classification.

**API.** Existing `./contracts/server`; no new export-map entry. `.changeset/core-retire-legacy-route-sinks.md` major and Opus update of `api-baseline/jini-ai__core.json`. Gate: no retired HTTP sink names in core/http-kit runtime source. Keep the check scoped to this seam rather than deleting independent callbacks that happen to use the same name. Publish J3a and J3b with J4, not as separate public cuts.

### P4-T1.T — Tovu — shutdown settlement — READY

**Files.** `W/server/inbound/assistant/agent-daemon-server.ts` and `W/server/runtime/composition/__tests__/process-root-parity.test.ts`.

**Test first.** `pointer removal waits for publication after the owned connections close`. Extend the existing late-fsync-rejection test, retaining its original name and assertions, or add a companion with that exact design name. Add `afterSettled` to the `new Function` params and pass a forwarding spy with `({ promise }: { promise: PromiseLike<unknown> }, _optional = {})`. Assert it receives the original publication promise once and sees `store-closed` already in the call log. Retain the second-signal no-op and final order `["store-closing","store-closed","remove:123","exit:143"]`. Mutation: drop `await` or move `removeIfCurrent` before settlement.

**Edit.** Import `afterSettled` from `@jini-ai/core/errors/idioms` and replace only `await registryPublication.catch(() => undefined)` with `await afterSettled({ promise: registryPublication })`. Keep the existing `exitDaemon({ exitCode }, _optional = {})`, listener drain, per-scope disposal, PID ownership check, and publication/delete rationale. No new port, dependency version, export, changeset, or baseline.

### P4-T2.T — Tovu — reader parity and host reporter composition — OPUS-CHECK

**Tests first.** Run E4-T-READERS through the real Tovu binding. Assert flat with approved details, flat without details, nested `requestId`, legacy UUID, ERR ID, and missing ID. Include conflicting fields to pin `details.errorId` → flat body `errorId` → decoded `requestId`, and verify signed-out/auth-route responses do not adopt details. Use `admin-failure-channel.unit.test.ts` and the transport characterization in the anchor table. No production reader change is expected.

Create the missing `W/server/inbound/shared/__tests__/admin-failure.unit.test.ts` for the focused pins. Extend `observability-error-report.test.ts` and `jini-routes.unit.test.ts` for the real request scope and mount:

- `one admin failure writes one host record and one tracker report with the same ERR- id as the reply` — restore the console sink beside the reporter or record twice.
- `disk-space refusal reports nothing and carries no id` — move reporting before the already-landed 507 branch.
- `an admin 500 produces one tracker report, not also the http.request 5xx marker`.
- `a Jini route mounted through daemonRouteHost answers with the reporter's ERR id`.
- `a failure already reported by a tool keeps its id in the admin reply`.

Add a provider-facing redaction canary. Assert the Tovu-specific shape is absent in the message, stack, attributes, and serialized error. Pin the request’s already-reported case and the genuine unreported-5xx fallback separately. Add a two-site daemon scope fixture that fails if one site’s diagnostic reaches the other site’s tracker.

**Factory and shared lifecycle.** Create `W/server/runtime/composition/error-reporter.ts`:

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

Host binds the version values once from the running build and the installed core version, not from browser constants. Use `mintToolErrorId({ randomHex: ({ bytes }) => randomBytes(bytes).toString("hex") })`, the injected clock/logger, and core’s catalog factory with empty `admin`, `http`, and `ipc` scopes where host refusals already have owners. Use Tovu redaction options. `trackerReportPort({ tracker }, _optional = {})` uses the existing `redactedTovuError` helper before `tracker.error`. Export a clean Error view that cannot carry an unsanitized `cause` or enumerable custom fields. Project bounded incident ID and trace metadata through the tracker context without bypassing its scope admission or provider filtering. Do not reuse desktop product telemetry as evidence that site-provider egress is redacted. Opus must see the provider canary pass.

`AdminFailurePorts` in `admin-failure.ts` becomes `{ tracker?: Pick<Tracker,'error'>; reporter?: Pick<ErrorReporter,'record'>; trackerAlreadyReported?: boolean }`. Keep `reportServerFailure({ error, operation }, { tracker, reporter, errorId?, trackerAlreadyReported? } = {})`. In reporter mode call `record({ error, step: operation, operation }, { errorId?, tracker?: 'skip' })`, with skip selected only by the existing request scope’s actual prior admission. No legacy console/tracker call on this arm. Keep the fallback arm for unbound callers. Contain a breach with a fixed diagnostic and the unavailable ID, without falling through and minting another ID.

`adminFailureResponse({ error, tracker?, reporter?, trackerAlreadyReported? }, options = {})` preserves C115 first. Classify → obtain the one recorded ID → build the response. Use the existing formatter rules on the **approved disclosure cause**, not a regex on arbitrary thrown content, to identify an eligible existing ID. If a cached reporter ID wins over a competing approved-cause ID, the recorded ID must also win in the structured body and Copy details. Use the existing redaction options to suppress the competing ID for that formatting pass and pin it. Do not widen anonymous details or add an operator cause where none was previously approved. `sendAdminFailure` reads `res.locals.failureReporter` alongside the existing tracker and shared admission scope. Keep inbound/shared independent of composition.

**Exact host edges.**

- Website `createApp` binds once before `applyPublicMiddleware`, public routes, and admin mounts. If the same site deps build another app for internal export, reuse that site composition’s reporter through its existing composition input. Set `res.locals.failureReporter` app-wide before the public/admin split. Do not substitute the admin-only `:431` middleware for that binding. `applyRequestTracking` still owns request ID, ALS admission, and the marker. Keep the artifact observability exclusion and existing route-order gates.
- Bind the same reporter through `admin-json-route-ports.ts` at the direct failure branches `:233,315`, and where host-controlled diagnostics take only a tracker. Current production tracker-only direct callers include `admin-http/http/widgets.ts:78`, `routes/analytics/recent-hits.ts:101`, `routes/posts/template-preview.ts:232`, `routes/publish-content/peer-transport.ts:120`, `modules/widgets.ts:62`, `federation-reload-route.ts:51`, `commerce-http.ts:58`, public `middleware/{site-cookie-consent,theme-page-preview}.ts`, `routes/{content/posts/get-by-slug,mail-feedback,members/complete-sign-in,members/sign-in}.ts`, and `routes/site/{feed,llms,newsletter-confirm,newsletter-unsubscribe,products,robots,search,sitemap}.ts`. Pass the reporter through their existing object seams. For detached member delivery and member OIDC inject it into the existing closure or args at registration, not out of a closed response later. Leave the broad `sendAdminFailure` caller population alone. Its shared adapter picks up locals.
- `daemonRouteHost({ context, parserLimitBytes, errors }, _optional = {})` returns `context: { ...context, errors }` and uses the reporter-backed factory from the host composition. `mountJiniRoutes({ app, routes }, { rawBody?, redactionPatterns?, reporter? } = {})` passes the record port into `createNodeDispatcher`. Keep Express fallthrough, wire spellings, parser limits, and raw upload handling. Bind at daemon scope mounts, `W/assistant/surface-route-host.ts:15–16` via the two `a2ui`/`mcp-ui` registrars, `modules/assistant-tool-exec.ts:102,258`, and the visitor frontend control injection at `modules/site-assistant.ts:618` / `W/assistant/site/visitor-frontend-control.ts:27,85`. Pass a bound host/dispatcher callback through the existing ports instead of importing implementations into the domain. For desktop HTTP use a desktop-owned diagnostic binding at `desktop-chat-main.ts:57–59` into `createDesktopAgentRuntime` and `startBridgeServer`. Do not borrow a site’s tracker. This is not the deferred IPC binding.
- `agent-daemon-server.ts:211,254` injects `createTovuErrorReporter` through the existing scope options for both launch paths. Build once **after** the authorized site deps arrive at `agent-daemon-scope.ts:145`, and share with its HTTP and T3 tool paths. Merge-21 can host multiple sites under one OS process, with per-site sinks. One site owning its own scope is the isolation unit. Do not use a process-global reporter backed by the first site. For a host with no operation tracking, bind the explicit no-op tracker port. Do not synthesize a site tracer from another site’s tracker.
- Before enabling J3, bind reporter-mode adapters at the central admin/public JSON/raw mount seams and the direct `dev-auth.ts` registrations, including mounts built from narrow per-route deps. Do not pass the entire `RouteDeps` into a route spec. This fan-out is the release gate. If the current mount wrappers cannot take the host binding without changing unrelated route contracts, STOP the **J3 cut**, and retain the additive J2 mode while the revised mount inventory is reviewed.

Add Wiring to `W/server/inbound/shared/INFO.md` as a new doc. List required bindings, ownership scope, why inbound/shared never imports composition, and the coordinator’s ADR-071 reference. Cite the existing server `INFO.md` Wiring where useful.

**API.** No Tovu export-map or API baseline change. Update root manifest and lockfile together to the actual coordinated Jini artifacts once supplied. Check the current http-kit override at `package.json:123–124`, and daemon/http-kit/server ranges at `:147,152,166`, so it cannot retain old deps. Don’t invent release numbers. The reader tests do not require a new `@jini-ai/admin` release or a dependency change in `apps/admin/package.json`.

### P4-T3.T — Tovu — share the reporter with daemon and BYOK tools — OPUS-CHECK

**Files.** `W/assistant/tool-recovery-preset.ts`, `byok-tool-surface.ts`, its existing `agent-daemon-port.ts` public surface if a deleted type is named, `W/server/inbound/assistant/{agent-daemon-scope,agent-daemon-scope-tools,agent-daemon-scope-http}.ts`, and `W/server/runtime/composition/{http-app/mount-assistant,modules/assistant-byok}.ts`. Update direct executor and disclosure fixtures. Put deterministic reporter fixtures in the owning test setup, not production defaults.

**Tests first.** `a failed site tool shows the same ERR- id to the model and in the host log`, parameterized with tracking enabled and disabled. Mutation: restore the noop skip. `standalone withRedactedToolFailures still redacts and stamps an id`. Replace the callback pins at `delegated-tool-error-disclosure.test.ts:54` and `tool-executor-stack.failure-redaction.test.ts:159` with one recording reporter and ID equality. Retain the audit ID, transport status, unauthorized resolve-principal refusal, and model canary assertions. Update the BYOK pin at `tool-executor-stack.failure-redaction.test.ts:337` to look for the reporter’s host record instead of the removed `[tool-failure]` console line.

**Edit.** Replace the Tovu `RedactedToolFailuresDeps` options with `{ mintErrorId?: () => string }` and remove `ToolFailureRecord` imports/exports and `failurePorts`’s `onFailure`. Keep `withRedactedToolFailures({ inner }, { mintErrorId? } = {})` as the standalone redaction-and-stamp adapter. It does not report by itself. Use `describeDelegatedInternalError({ context, reporter }, { mintErrorId? } = {})` and `delegatedToolErrorDisclosure({ reporter }, { mintErrorId? } = {})` with the J4 result shape. Reporter is required in the first object. Bind `reportCancelled: true` there and preserve Tovu redaction/copy. `createAssistantToolExecutor(required: AssistantToolExecutorDeps, _optional = {})` adds required `reporter` and forwards the bound lifecycle port with the two redaction collaborators. Keep the live registry, recovery approvals, and audit ports unchanged.

`createScopeToolExecutor` takes the reporter in its existing required object at `:121`; scope creation supplies it to the tool stack at `:197` and the HTTP deps at `:242`. The delegated HTTP mount at `agent-daemon-scope-http.ts:198` binds disclosure to the same instance. In BYOK, pass the website reporter through the existing `mountAssistant` → `createAssistantByokModule` → `createByokToolSurface` required bags to the executor at `:573`. Do not instantiate by turn, route, or tool. Preserve `PrepareToolGuidance`’s already-moved core import.

**API and release gate.** No Tovu export-map, changeset, or baseline change. Use J4 from the same staged artifact set as T2. For J3 clearance, inventory all test-only `reportRouteInternalError` imports in Tovu and replace them with a bound reporter or test fixture in the owning suite. Do not remove the callback while retaining its assertions or keep a re-export shell. Scope, BYOK, and direct tests must all use the same reporter where a failure crosses their boundaries. The broad test migration is part of the held J3 consumer gate, not a claim that all 30 files are already migrated.

### P4-T4 — Tovu — NOT-SHEETED for a new commit

Do not replay `04d030b5a9`. Opus owns the merge-13 `(rule, path)` baseline, rename-normalized comparison of the four named refs, and merge-21 strict gate. This dispatch could verify source and tests, not build the baseline or measure regressions. If a new regression is found, sheet **that row** against the current owner with its original behavior test and size rule. The transform-conflict test is a surviving I pin. P6/P10 consume the landed feature behavior. No migration or ledger rewrite follows merely from reconciling the result.

### P4-T5.T — Tovu — prove duplicates before removing a sink — OPUS-CHECK

**Files and tests first.** Extend `W/server/inbound/shared/__tests__/observability-error-report.test.ts` with `a public route failure is reported once` and `an unreported 5xx still produces the http.request marker`. Add `browser telemetry still reaches the tracker` to the existing Tovu browser-telemetry test file. Drive both a counting host logger and a real tracker with recording observability. The mutation re-adds `console.error` alongside `reporter.record` for the public boundary. The test must count both, not just tracker events.

Put the verified candidate list in the test header and PR description. If tests prove two writes for one incident, change only the redundant write in its owning file in this commit. The marker is independent when no request work reported. Browser telemetry is independent and now lives in Jini, so this Tovu sheet does not modify it. The cookie-consent diagnostic-unavailable lines are in fallback catches, not proven duplicate writes. The legacy `reportServerFailure` branch is mutually exclusive with reporter mode. Do not delete it just because a reporter path exists. It can be retired only once all production callers, including detached member delivery and OIDC, have a replacement and there is no remaining supported legacy host. If no pair is proven, this is a **test-only commit**. Keep the why-comments for the marker, tracker scope admission, and browser independence.

**API.** No new signatures, package exports, changeset, dependencies, or baseline update.

## Owner questions decided by default

| Question | Default binding |
|---|---|
| Q-J2a node-bridge sink | Inject `NodeDispatcherOptions.reporter` from the mount owner. The bridge resolves genuinely unhandled transport incidents to ERR IDs without intercepting pre-header Express `next(error)`. |
| Q-J2b audience | Bind `audience: 'anonymous'` in the HTTP operation’s describe options. No auth-derived audience or new Copy-details disclosure in P4. |
| Q-J2c thrown abort | Bind `settle: disconnectVerdict` at the route boundary. Only an aborted signal plus an abort-like throw is cancellation. |
| Q-J2d streaming | Bind the operation around response creation. Returning the stream ends the span. Later stream failure is transport-owned. |
| Q-J3a release grouping | Supply required `CreateLocalNodeDaemonConfig.errors` after retirement, with no fallback preset reporter. Server major, grouped with core/http-kit/daemon changes. |
| Q-J4a cancelled ID | Tovu’s delegated disclosure binds `reportCancelled: true`. Cancelled results are recorded at that route only. A resolve-principal incident is also route-owned. |
| Q-J5a refusal wire | Bind `refusalCode: 'HANDLER_ERROR'`. Refusal adds `reason` and has no `requestId`. |
| Q-T2a reporter location | Inject the site-owned `failureReporter` once into each website or daemon site composition. In a shared daemon that means one per authenticated, site-bound scope. The desktop HTTP bridge has its own owner. |
| Q-T2b tracker redaction | Bind the redacting `trackerReportPort` as the reporter’s `observability.reportError`. Do not enable it until the actual provider-facing canary proves it. |

## STOP list

1. **J3a/J3b execution and breaking publication.** The widened Tovu fixture inventory and missing mount bindings fail the design’s consumer gate. Resolve them with reviewed T2/T3 replacements. Audit the actual staged artifacts before claiming P7-J2 release readiness.
2. **T2 activation.** Stop if the real tracker/provider path leaks a canary, creates a duplicate 5xx marker, engulfs an unrelated incident through dedupe, or bridges site telemetry across daemon scopes. The host reporter must not bypass the existing auth, redaction, or request-admission boundaries.
3. **T4 regression reconcile.** NOT-SHEETED until Opus has the baseline and current gate results. Do not reopen the landed batches from old line numbers.
4. **T5 production deletion.** No removal is authorized by source inspection alone. If the counting test proves one report and an independent fallback, keep both owners as designed.
5. **Deferred verification.** Opus runs the cycle, complexity, API surface/baseline, and named mutation checks. Chrome admin 500 correlation is owed after T2. The Electron handler-failure check stays owed until a host actually adopts J5. No schema or ADR-066 migration work is part of these sheets.
