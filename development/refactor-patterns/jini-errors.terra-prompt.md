- BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). Bootstrap files (AI-Dev-Shop/AGENTS.md, CLAUDE.md/AGENTS.md startup steps) do not apply and may be missing; expected. This prompt is complete; proceed.

# Terra prompt: Jini errors rev 6, burn down the log-safety debt list

STATUS: DRAFT rev 6 + review d5r6 fixes (2026-11-15), NOT READY until the coordinator's re-review. Self-contained.
**Part A** = Jini monorepo, five Sonnet lane recipes (L1-L5, section 6); each job runs ONE lane, named in its dispatch.
**Part B** = Tovu (section 8), run only after Part A is reviewed and Jini is released; it lands in the SAME
commit as Tovu's `@jini-ai/*` bump. Paths were read on Jini `design-d5` (head a4472d838) and Tovu 5ea85d833;
if a line moved, find the quoted text in the same file.

**What changed (rev 6 + review d5r6; earlier revisions are in git).** Raw log paths are found by a gate,
`scripts/check-log-safety.mjs` (ESLint core rules), against a checked-in debt list that may only shrink; the shared
pieces (`describeErrorForLog`, `describeLogMeta`, desktop-host `projectForLog`) are safe by construction, plain
thrown objects included. Review d5r6 added two gate rules: `.message`/`.stack` ASSIGNED to a stored field
(`entry.error = error.message`) is `stored-error-text`, and `console-logger` reports a `logger`-named holder typed
`Console` or defaulting to `console` (the `Logger` error-bag exemption trusts the receiver's name). Part B's
diagnostic sink pre-slices, redacts, then caps (section 8); the console summary carries fixed ID fields only.
Package manifests and the lockfile are the coordinator's (section 1). Part A runs as five Sonnet lane recipes
(L1-L5, the coordinator's local artifacts) built from this prompt and the P4 work list; the lane recipe wins.

## 0. Preconditions (check first; if one fails, STOP and report which)
- **P1 safe describer.** `grep -n "registerLoggableErrors" packages/core/src/model-facing-tool-errors.ts` matches;
  `grep -n "constructor.name" packages/core/src/model-facing-tool-errors.ts` does not.
- **P2 safe sinks + gate.** `packages/core/src/primitives/logger.ts` exports `describeLogMeta` and contains
  `[unreadable]`; `packages/desktop-host/src/logging.ts` has `projectForLog` and no `error.message`;
  `packages/http-kit/src/internal-error.ts` exports `reportRouteInternalError`; `packages/daemon/src/http/model-proxy.ts`
  has no `defaultInternalErrorSink`; `scripts/check-log-safety.mjs` and
  `packages/agent-runtime/src/skills/web-clone/scripts/lib/diagnostic-labels.mjs` exist.
- **P3 red, then green, recorded** for every pair in `jini-errors.md` section 6 (the cloud gate's records; ask
  for them, do not run anything).
- **P4 gate adopted on the merged base** (coordinator, before dispatch): on `refactor/terra` (tip d4bfc6ceb when
  rev 6 was written) merge `design-d5` (3de14a578). The merge conflicts in 3 files: take design-d5's side in each,
  but keep refactor/terra's doc-comment line in `packages/daemon/src/http/model-proxy.ts` (~:61, the line citing
  `` `f0a771d88^:packages/deploy/source-map.md`'s precedent ``). Then
  `LOG_SAFETY_BASE_REF=d4bfc6ceb node scripts/check-log-safety.mjs --update`, expected output
  `Log-safety ratchet passed: 379 raw log paths in 243 file/rule entries.`; commit `scripts/log-safety-debt.json`.
  CI: step `log safety (blocking ratchet)` right after `size (blocking ratchet)` in refactor/terra's ci.yml, env
  `LOG_SAFETY_BASE_REF` / `LOG_SAFETY_FIRST_PUSH_COMMIT` set exactly like the `SIZE_*` pair, running
  `pnpm check:log-safety`. A different count: STOP and regenerate the work lists before dispatch.
- **P5 work list.** The dispatch carries the `node scripts/check-log-safety.mjs --list` lines (with line numbers)
  for this lane's files, generated on the P4 base; the lane recipe carries them.

## 1. Ground rules
- **No tests, tsc, builds, installs, ESLint or gate runs in the job**, no `node_modules` changes. The cloud gate
  runs everything after the coordinator commits. Do not commit, push, stash, `git add -A` or `git checkout`;
  leave changes in the tree. Never edit `scripts/log-safety-debt.json` (the coordinator regenerates it once).
- Only the files of your batch (section 6) and their nearest existing test files. Smallest change per entry; no
  renames, moves or reformatting. Keep every comment; a "why" comment on replaced code moves with the code.
- Every function you add or change: at most 50 lines; cyclomatic AND cognitive complexity at most 10 (admin
  package: at most 9/9). Args are `(requiredObj, optionalObj = {})`, private helpers too; a positional function
  you change becomes that shape and its callers follow. No `eslint-disable` (the existing `no-console` lines on
  a default sink move with it), no `as any`, no non-null `!`.
- Helpers allowed, no others: `describeErrorForLog({ err })` (`@jini-ai/core`; browser files import from
  `@jini-ai/core/model-facing-tool-errors`), `reportRouteInternalError` and `RouteInternalErrorSink`
  (`@jini-ai/http-kit`), the core `Logger` port, and `errorClassLabel` / `assetId` / `hostLabel` from the web-clone
  `lib/diagnostic-labels.mjs`. Never `formatErrorForLog`, `inspect(x)`, `String(x)`, `x.message`, `x.name`,
  `x.stack`, `x.constructor` or a raw `x.code` of a caught value in a log line, report, telemetry attribute,
  manifest or stored diagnostic.
- `package.json` and `pnpm-lock.yaml` are the coordinator's: a job never edits them. A package that would import
  a Jini package it does not declare: make the import as the recipe gives it and report `NEEDS DECLARATION <pkg>
  -> <dep>`; the coordinator adds every declaration (manifest + lockfile importer entry) in one commit after the
  batches. Never a dynamic `import()` or optional peer.
  Agent-plugin `.mjs` files and skill `scripts/*.mjs` import nothing from `@jini-ai/*`.
- Caller closure: a signature a job changes is changed at EVERY caller in the same job (rg across
  `packages/*/src`, tests included, and Tovu `apps/` `packages/`). A caller outside the batch's files is named in
  the dispatch and belongs to that job (e.g. `errorType({ error })`: `diagnostics/src/observability/errors.ts:28`,
  `observability/__tests__/unit/provider-boundaries.unit.test.ts:203`, `src/__tests__/observability-operations.test.ts:177-182`).
  No caller list in the dispatch: keep the old signature.
- **Skip rather than improvise.** An entry that fits no variant, or would need a design choice this prompt does
  not make, is left unchanged and reported with one line why.
- **Tests: write, do not run.** Per changed source file, one test in the nearest existing test file (new file
  only where none exists). Tests go in test files only, never in a source file, so the coordinator commits all
  test files first (the red revision) and the sources second (green). Secret input
  `new Error("boom api_key=SECRETSECRETSECRETSECRET")`; assert `boom`, `SECRETSECRET` and the test file name (a
  stack frame) are absent from every printed/exported/stored argument. Report per test the assertion that must
  fail on the pre-fix source. Update tests that pin the old full text in the same change
  (`rg -n "stringContaining\('Error: |toContain\('boom'\)" <package>/src`).

## 2. The rule
A log line, report, telemetry attribute or stored diagnostic says what failed (fixed words), the IDs it has, and
`describeErrorForLog` of the caught value: never the value's text. Full detail goes to the HOST: a typed throw
with `cause`, an injected sink/port (`onInternalError`, a `diagnostics` sink), or the `error` bag of a `Logger`.
Why: a caught error's text can quote untrusted input or a credential no redaction pattern knows.

## 3. Rule -> variant (one decision per gate entry)
| Gate rule | Where | Variant |
|---|---|---|
| `error-text`, `error-format`, `error-helper`, `raw-error` | `console.*` or a one-string log function | **LOG-TEXT** |
| same | a core `Logger` call | **LOG-PORT** |
| `stored-error-text` | manifest, report row, trace or diagnostic record | **STORED** |
| `stored-error-text` | UI state shown to a person, an API/tool answer to the caller or model, a thrown error's message/body/cause, an expected refusal's own text | **not this lane**: entry stays (U/R lanes) |
| `console` | plain words and IDs only, no caught value (operator CLI output, warnings) | **KEEP**: entry stays |
| any | a false positive (`record.message` of a log record, a `reason` holding fixed words) | **KEEP**, reported "false positive: why" |
| `console-logger` | a `logger` declared as `Console` / `Pick<Console, ...>` or defaulting to `console` | **KEEP** (debt; the rule keeps a `Logger`-bag call off it) |

- **LOG-TEXT**: replace the WHOLE expression that formats the caught value (`inspect(x)`, `formatErrorForLog({ error: x })`,
  `x instanceof Error ? x.message : String(x)`, `errorMessage(x)`, a bare `x` argument or `${x}`) with
  `describeErrorForLog({ err: x })`; keep the fixed words, labels and IDs. The `console` entry stays when the call
  stays. Remove imports only when nothing else in the file uses them. Where the function already has a host port
  (`onInternalError`, a `Logger`, a `diagnostics` sink), the original value goes there as well, unformatted.
- **LOG-PORT**: `logger.warn({ message }, { meta, error })`: the message keeps only fixed words and IDs; the
  original value goes in the `error` bag, unformatted. The default loggers print it as class only; a host logger
  is the host's channel.
- **STORED**: the stored field becomes `describeErrorForLog({ err: x })` (self-contained bundles:
  `errorClassLabel({ error: x })`); a URL in the same record becomes `hostLabel`/`assetId` from
  `lib/diagnostic-labels.mjs` where one is used today. If a host port is in scope, it gets the original.
- **HELPER**: a function that builds diagnostic text from a caught value returns describer-based text; its
  callers do not change.
- Within a file you change, a caught value reaching a log through an intermediate variable in the same function
  (the gate does not trace data flow) is fixed too and reported as "found by reading".

## 4. Worked examples (read before the first entry)
- Describer + default sinks: `packages/core/src/model-facing-tool-errors.ts`, `src/primitives/logger.ts`
  (`describeLogMeta`), `packages/desktop-host/src/logging.ts` (`projectForLog`); tests
  `primitives/__tests__/defaults.test.ts`, `desktop-host/src/__tests__/logging.test.ts` (5fcbb3ca1 red, 62fcaf2e0 fix).
- Route owner: `packages/http-kit/src/internal-error.ts`; caller `packages/daemon/src/http/model-proxy.ts`
  (`reportCatchAllError`, fixed `model-proxy/unknown`), test `src/http/__tests__/model-proxy.test.ts`.
- Host port: `packages/commerce/src/payments/ingest/settlement-worker.ts` `warn({ message }, { error })`.
- CLI labels: `agent-runtime/src/skills/web-clone/scripts/lib/diagnostic-labels.mjs`, `mirror-site.mjs`,
  `asset-harvest.mjs`, tests `scripts/__tests__/{diagnostic-labels.unit,mirror-site.unit,asset-harvest}.test.mjs`.

## 5. Explicit rows the gate cannot see (the lane that owns the file does them; A1-A5 = the old batch names)
### 5a. Helpers (A2, A3, A4)
- A2 `integrations/src/webhooks/worker.ts:92-101` `describeWebhookTickError`: return
  `` `${WEBHOOK_DELIVERY_FAILED_LINE}: ${describeErrorForLog({ err: error })}` `` (drop the URL/word scan, the cap
  and the raw code; delete constants nothing else uses). The `:130` caller is unchanged; update `worker.test.ts:109-113`.
- A2 `diagnostics/src/observability/otel.ts:15-22` `errorType`: returns
  `describeErrorForLog({ err: error }).split(" cause=")[0]`, redacted and capped as today; delete
  `fallbackErrorLabel` and the inline code regex; the signature becomes `errorType({ error })` and every caller
  follows (`otel.ts` x4, `errors.ts:28`, `provider-boundaries.unit.test.ts:203`); update the doc comment and the pinned tests in
  `src/__tests__/observability-operations.test.ts` (`:164` -> `"TypeError"`, `:177` -> `"TypeError(ECONNRESET)"`,
  `:181` -> `"Error"`; `:178`, `:182` unchanged).
- A2 `diagnostics/src/observability/delivery.ts:36` `describeTelemetryFailure`: read `name`, `statusCode`,
  `status`, `code` ONCE each into locals inside the existing `try`, then decide from the locals. Test: a `name`
  getter returning an allowed class first and `SECRETSECRETSECRETSECRET` after gives the class and is read once.
- A2 `sidecar/src/json-ipc.ts:356-364`: the formatted exception goes to console AND to the trace record; both
  get `describeErrorForLog`. A2 `diagnostics/src/sources.ts:40` -> `manifest.ts:58,71`: the exported manifest
  stores the describer (STORED).
- A3 `db/src/pglite/socket-server.ts:393`: `` `socket server error: ${describeErrorForLog({ err: error })}` ``.
- A4 `agent-plugins/src/admin-surfaces/connections/connections.ts:112`: the warn's tail `${codeOf(error)}` becomes
  `${describeErrorForLog({ err: error })}`. `codeOf`/`failedAttempt` (`:30-39`) do NOT change: the stored attempt
  is the admin status answer. Test: code `SECRETSECRETSECRETSECRET` -> no `SECRETSECRET` in the warn; the stored
  attempt stays `sign-in-failed`.

### 5b. Form notification (A5) `cms/src/forms/notify-subscriber.ts`
Provider refusals can echo credentials or private input. The `:124` helper `warn(logger, message, error?)`
becomes `warn({ logger, message }, { error } = {})`, body `logger.warn({ message }, error === undefined ? {} : { error })`
inside the existing try (keep its catch); doc comment: the message carries fixed words and IDs; the refusal
travels as the error object to the host's logger. `:172`:
`` warn({ logger: deps.logger, message: `[forms:notify] mail send failed for submission '${submissionId}' recipient '${recipient}'` }, { error: Object.assign(new Error(result.message), { code: result.errorCode }) }); ``
Move the helper's other callers to the object form. Test: refusal `{ ok: false, errorCode: 'X', message: 'refused PRIVATEVALUE' }`
with `createConsoleLogger` -> no `PRIVATEVALUE` in any console argument; with a recording `Logger` -> the
message has no `PRIVATEVALUE` and `error.message === 'refused PRIVATEVALUE'`.

### 5c. Web-clone CLI scripts, remaining (A4), via `lib/diagnostic-labels.mjs`
`asset-harvest.mjs:~394` (`asset-harvest failed: ${error.message}`): a usage error becomes a local
`class CliUsageError extends Error {}` thrown by the argument checks and printed with its own text (fixed words
the script wrote); anything else prints `errorClassLabel({ error })`. `dna-scaffold.mjs:229` (the recon parse can
quote file contents), `:262`; `lib/main-guard.mjs:55`: `errorClassLabel`. Raw URLs never print: use `assetId` /
`hostLabel`. (mirror-site and asset-harvest URL rows are done.) Test in the nearest script test: a failing
parse prints `Error` and no `boom`; a usage error still prints its text.

### 5e. Data flow through a result field (later lane, not in L4's recipe)
`agent-runtime/src/anthropic-live-models.ts:138` logs `result.detail`, which `model-catalog.ts:297` fills with
`(err as Error).message`: a caught value's text reaches a log through a field the gate does not trace. Fix in a
later lane: `detail` gets `describeErrorForLog({ err })` where it is filled, or the log line drops it.

### 5d. CN: one incident owner per route pack (A1)
Route each pack through `reportRouteInternalError({ report, logSource, message }, { onInternalError: deps.onInternalError })`:
- KEEP each exported `XInternalErrorContext` type (fields may be ADDED), its `onInternalError` dep and all
  doc/why comments (a sink's why-comment moves onto the call). `report` = the context's fields minus
  `correlationId`; if TS cannot infer, pass `reportRouteInternalError<Omit<XInternalErrorContext, 'correlationId'>>(...)`.
- DELETE the local default sink and the local `randomUUID()` + sink call; keep a local wrapper only when it picks
  the message. `logSource` = the label the old default line printed; `message` = the row's words, never
  `"an internal error occurred"`. Original errors go to the sink unwrapped.

| File | Sources -> message (all end " Try again; if it keeps failing, copy the request ID and report this problem." unless written out) | logSource |
|---|---|---|
| `daemon/src/http/runs.ts:43,88` | keep its two messages | `source` |
| `daemon/src/http/attachments.ts:1422,1430` | `attachment-upload` "The file could not be attached."; `attachment-cleanup` "The attachment could not be removed." | `source` |
| `daemon/src/http/attachment-lookup-routes.ts:59` | `registerAttachmentLookupRoutes`' optional becomes `{ onInternalError }: { onInternalError?: RouteInternalErrorSink } = {}`; `sendLookupFailure({ res, error }, { onInternalError, runId } = {})`; unexpected failure (not `AttachmentRejectedError`, whose own refusal answer is unchanged): report `{ source: 'attachment-lookup', ...(runId === undefined ? {} : { runId }), error }` with `runId = lookup.runId`, "The attachment could not be looked up." | `attachment-lookup` |
| `daemon/src/http/media.ts:170,175` | local `reportInternalError` becomes `({ deps, source, error, taskId, ownerRef }, _optional = {})` (5 callers); report keeps `taskId`, `ownerRef`. `media-generate-dispatch` "The media could not be generated."; `media-task-store` "The media task could not be read or saved. Reload to check the task; if it keeps failing, copy the request ID and report this problem." | `source` |
| `daemon/src/http/terminals.ts:58,92` | `terminal-create` "The terminal could not be opened." | `source` |
| `daemon/src/http/db-ops.ts:197,239` | `db-inspect` "The database could not be inspected."; `db-verify` "The database check could not finish."; `db-vacuum` "The database could not be compacted." | `source` |
| `daemon/src/http/connectors.ts:139,164` | report `{ source, operation, error }`; `auth` "The sign-in provider could not finish this request."; `storage` "The file storage provider ..."; `db` "The database provider ..."; `realtime` "The realtime provider ..." (same tail) | `` `connectors/${source}.${operation}` `` |
| `daemon/src/http/remote-run-events.ts:42,224` | add `readonly runId: string` to `RemoteRunEventInternalErrorContext`; `toRemoteEventError` becomes `({ error, runId, deps, source }, _optional = {})`; report `{ source, runId, error }`. `tool-use` "The tool call could not be recorded for this run. Check the run status; copy the request ID and report this problem."; `tool-result` same with "tool result" | `` `remote-run-events/${source}` `` |
| `daemon/src/http/research.ts:153,236` | report `{ error }`, "The web research request could not be completed." | `research/search` |
| `daemon/src/http/xai.ts:217` + every `resolved.onInternalError({...})` (340, 358, 460, 520, 571, 590, 785, 801) | `oauth-start` "xAI sign-in could not start."; `oauth-complete` "xAI sign-in could not be completed."; `oauth-disconnect` "xAI could not be disconnected."; `auth-status` "The xAI connection status could not be read."; `search` "The X search could not be completed." DROP every `redactError(error)` wrapper before the sink (the host gets the original and redacts under its own policy); delete `redactError` if nothing else uses it and move its why-comment's point ("upstream bodies can carry secrets; the host redacts") to the sink doc. Each call: `` const apiError = reportRouteInternalError({ report: { source, error }, logSource: `xai/${source}`, message }, { onInternalError: resolved.onInternalError }); `` answering `apiError`; 340/358 ignore the return. `ResolvedXaiHttpDeps.onInternalError` (`:214`) becomes optional, `:249` passes `deps.onInternalError` with no default; delete `INTERNAL_ERROR_MESSAGE`. `callXaiSearch`'s own inline redaction is unchanged. | `` `xai/${source}` `` |
| `daemon/src/http/delegated-tools.ts:157,182` | "The tool could not run because of a server fault. Do not retry the same call; tell the user to copy the request ID and report this problem." Keep `describeSafely` precedence: `const apiError = reportRouteInternalError({ report, logSource: report.source, message }, { onInternalError: deps.onInternalError }); const described = describeSafely(deps, { ...report, correlationId: String(apiError.requestId) }); return described === undefined ? apiError : createApiError({ code: 'INTERNAL_ERROR', message: described }, { requestId: apiError.requestId });` `describeSafely`'s own line (`:176`) is LOG-TEXT. | `source` |
| `daemon/src/http/frontend-sessions.ts:132,336-340` | "The page connection could not be opened. Reload the page; if it keeps failing, copy the request ID and report this problem." Pre-header answer `res.status(500).json({ error: apiError })`; the local wrapper and its sink-failure catch go. `frontend-control.ts:78` adds `'onInternalError'` to the `session` Pick. Test in `frontend-control.test.ts`: `session.onInternalError` gets `{ source, error, correlationId, logSource }`, the answer carries the same `requestId`. | `` `frontend-sessions:${source}` `` |
| `http-kit/src/adapter.ts:38,205` | keep its message; report `{ method: spec.method, path: spec.path, error: e }` | `` `${spec.method.toUpperCase()} ${spec.path}` `` |

Test per file: status + exact message; response `requestId` === the sink's `correlationId`; the sink gets the
route's fields (incl. `runId`, `taskId`/`ownerRef`, `toolId`/`status`/`recoveryMessage` where the context has
them) + the original error (`toBe`, never a wrapper); with no sink the default line is
`internal error (<logSource>, correlationId=<id>) Error` with no `boom`, stack or `SECRETSECRET`. Update tests
pinning `'an internal error occurred'` (e.g. `src/http/__tests__/remote-run-events.test.ts:483`).

## 6. Lanes
Part A runs as five Sonnet lane recipes on the P4 tree (L1 daemon, L2 core/hosts, L3 data/platform/plugins, L4
agent, L5 UI/chat/CMS; file-disjoint, in parallel). Each recipe lists its gate entries (from the P4 `--list`), its
files and every edit. The old per-batch entry lists (A1-A5) are superseded; they are in git (Tovu bd5891144).

**End state (coordinator, after all five lanes are committed):** one cloud run of
`node scripts/check-log-safety.mjs --update`, committed; the base comparison refuses any growth, and every entry a
job reported "fixed" must be gone. The gate then passes with the shrunk list; the remaining entries are KEEP,
not-this-lane or skipped, each with a reason in a job report.

## 7. Not this lane (say so in the report)
Express contracts (`http-kit/src/adapter.ts`, `daemon/src/http/frontend-request-route.ts`) and xAI vendor
configuration in daemon stay in the server-port plan (`core/contracts/server.ts`) and the vendor-adapter rule; the
CN rows only replace sinks and messages and add no Express or vendor code. Rev 3 later lanes (Tovu 9286dc3f5,
sections 5-9): swallowed errors gaining a log (LS, RES-LS, MCP MR), cause handover (R, RS, memory), admin copy
(U), special sites (S, P, Q), comment-only drops (C), R-API constructors, DEP-chat, Part B T4/T6.

## 8. Part B, Tovu (after Jini's release; lands IN the `@jini-ai/*` bump commit)
Without it Tovu fails typecheck: `composeCommerce` passes a string `warn` into `createCommerceWorker`, whose port is
now `warn({ message }, { error })`. Same ground rules (no runs). Test input
`new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRETSECRET01")`.
- **T1** new `apps/website/src/platform/server-logs/jini-incident.ts`, two exports, each never throws:
  - `logJiniIncident(incident: { readonly error: unknown; readonly correlationId?: string } & Readonly<Record<string, unknown>>, { buffer = getServerLogBuffer(), source = "server" }: { readonly buffer?: Pick<ServerLogBuffer, "append">; readonly source?: ServerLogSource } = {}): string`
    1. `id = incident.correlationId ?? randomUUID()` (a route keeps Jini's request ID; a lifecycle incident gets one).
    2. Two context strings, `key=value` for each listed key whose value is a string or finite number (a value with
       whitespace or `=` is JSON-quoted): `idContext` from the FIXED ID keys `logSource, source, operation, provider,
       method, path, runId, batchId, taskId, toolId, status`; `storedContext` = `idContext` plus `ownerRef` and
       `recoveryMessage` (free text: stored only, never printed).
    3. Stored record, own try/catch: `buffer.append({ level: "error", source, message: \`[jini incident ${id}] ${storedContext} ${formatErrorForLog({ error: incident.error }, TOVU_ERROR_REDACTION_OPTIONS)}\` })`
       (`TOVU_ERROR_REDACTION_OPTIONS` from `@tovu/contracts/secret-redaction`; the buffer redacts the whole message
       before it caps it, and persists to the rotating site log when attached). D8: full text stored, never on the console.
    4. Console summary, own try/catch: `console.error(redactSecretShapes({ text: \`[jini] internal error (${idContext}, correlationId=${id})\` }).text, describeErrorForLog({ err: incident.error }))`
       (`redactSecretShapes` from `@tovu/contracts/secret-redaction`; an ID value can still carry a token shape).
    5. Return `id`. Assignable to every one-argument `onInternalError` port.
  - `logJiniDiagnostic(record: LogDiagnosticRecord, { buffer, source }: same optional = {}): void` (the type from
    `@jini-ai/core`): stores `[jini ${record.level}] ${record.message}`, the meta as guarded `JSON.stringify`
    (failure -> `[meta unreadable]`), PRE-SLICED, REDACTED, then capped:
    `redactSecretShapes({ text: json.slice(0, 3_024) }).text.slice(0, 2_000)`. Redacting before the 2,000 cap
    matters (a cap first can leave 1-19 characters of a `tovu_ak_<id>.<secret>` secret part, shorter than the 20
    the pattern needs). The 3,024 pre-slice (2,000 + 1,024) bounds the redaction cost on a large meta, and stays
    safe: a fragment it cuts starts past 2,000 whenever a rule's shortest match is under 1,024 characters (Tovu's
    key shape: 21 + 20), so the final cap drops it. And, when `record.error !== undefined`,
    `formatErrorForLog` under Tovu's options; `level` = the record's level; no console (the default logger already
    printed the metadata line).
- **Wiring** `onInternalError: incident => { logJiniIncident(incident); }` at: `server/inbound/assistant/agent-daemon-scope.ts`
  `:282 createRunLifecycle`, `:1434` the `adapter` object, `:357 createFrontendControl` `session`, `:1468 registerRunRoutes`,
  `:1492 delegatedToolRouteDeps`, `:1602 registerAttachmentRoutes`; `server/runtime/composition/modules/assistant-tool-exec.ts:88`
  `registerToolExecutionRoutes`; `assistant/daemon-access.ts:71 registerAttachmentLookupRoutes` (its new optional);
  desktop `apps/desktop/src/desktop-agent.ts` `createRunLifecycle` (~:341), `adapter` (~:370), `registerDelegatedToolRoutes`
  (~:372), importing in the file's `../../website/src/...` style. NEW rows:
  1. `contracts/core/events/jini-outbox-adapter.ts:57`: `createConsoleLogger({ prefix: "" }, { diagnostics: record => { logJiniDiagnostic(record); } })`.
  2. `assistant/site/visitor-frontend-control.ts`: `session.onInternalError` (`:30`) AND the httpExtension `adapter`
     object (`:63`) `onInternalError` -> `logJiniIncident`.
  3. `agent-daemon-scope.ts:393` `onBindError`: `logJiniIncident({ logSource: "frontend-bind", runId: context.runId, error: context.error });`
     then `lostFrontendBindings.noteBindError(context);`; the raw `console.error` (`:394`) goes.
  4. `server/runtime/composition/commerce.ts:214` worker port: `warn: ({ message }, { error } = {}) => { warn(message); if (error !== undefined) logJiniIncident({ error, logSource: "commerce" }); }`
     (`composeCommerce`'s own string `warn`, `:66`/`:74`, is unchanged).
  In Electron main the record lands in the in-memory process buffer unless a log file is attached there: say which.
- **Tests**, new `server-logs/__tests__/unit/jini-incident.unit.test.ts` (real `createLogBuffer` with
  `redactSecretShapes`; console recorded and restored in `finally`):
  (a) **response ID -> stored record through the real routes**: mount the Jini attachment upload, media and
  delegated-tool routes on an express app with a failing store/dispatcher/tool and
  `onInternalError: incident => { logJiniIncident(incident, { buffer }); }`; each answer's `requestId` appears in
  exactly one buffer entry with `boom`, the route's fields (`runId`; `taskId`/`ownerRef`; `toolId`/`status`/`recoveryMessage`)
  and the stack, never `SECRETSECRETSECRET`; the console summary has the ID and `Error`, not `boom`. A route
  needing more than ~40 lines of fakes: SKIP it, use `reportRouteInternalError` with that route's exact report
  shape, and say so. (b) lifecycle `logJiniIncident({ source: "inactivity-timeout", runId: "run-1", error }, { buffer })`:
  record and summary share the returned ID and `runId=run-1`. (c) a throwing `buffer.append` still prints the
  summary and does not throw. (d) `logJiniDiagnostic` stores message + meta + `boom`, no `SECRETSECRET`, writes no
  console; hostile meta (throwing getter) stores `[meta unreadable]`. (e) token at the cap: meta
  `{ pad: "x".repeat(n), token: "tovu_ak_0123456789ab.SECRETSECRETSECRETSECRETSECRET01" }` with `n` chosen so the
  2,000-character cut falls 5 characters after the token's `.`; the stored entry does not match
  `/tovu_ak_0123456789ab\.[A-Za-z0-9_-]/` (the public key ID before the `.` stays visible by design; after it comes
  the redaction marker). (f) context split: `logJiniIncident({ runId: "run-1", ownerRef: "owner-1", recoveryMessage:
  "retry with tovu_ak_0123456789ab.SECRETSECRETSECRETSECRETSECRET01", error }, { buffer })`: the console summary
  has `runId=run-1` and neither `ownerRef`, `recoveryMessage`, `owner-1` nor `tovu_ak_`; the stored record has
  `ownerRef=owner-1` and `recoveryMessage=` with the token redacted. Source-text wiring test (style of
  `main-owner-store-wiring.test.ts`): both `createFrontendControl` calls pass `session.onInternalError`, the
  visitor `adapter` has `onInternalError`, the outbox logger has `diagnostics`, `onBindError` calls
  `logJiniIncident` and `noteBindError`. Commerce: the worker port test in the existing commerce composition test.
- **T3** unchanged from rev 3 (Tovu 9286dc3f5, section 10 T3): `apps/desktop/src/main/boot/console-redaction.ts`
  `installMainConsoleRedaction`, called first in `apps/desktop/src/main/index.ts`, with its two tests.
- Not in scope: CLI one-shot commands other than `serve` print to the operator's terminal without a tee.

## 9. Report (final message)
Per gate entry: fixed (variant) / KEEP (why) / not this lane (why) / skipped (why). Section 5 rows: done or
skipped. "Found by reading" fixes. Test files written, each with the assertion that must fail before the fix.
Source files changed and test files changed, as two separate lists (the coordinator commits tests first).
Nothing else.
