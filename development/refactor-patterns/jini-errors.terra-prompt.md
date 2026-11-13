# Terra prompt: Jini errors, raw log paths onto the safe shared pieces

STATUS: READY (rev 4, 2026-11-13): every row's file:line was re-read on `design-d5` 9a2bcb954. Execution still
waits for precondition P3 (cloud-gate red/green records); without them, STOP at section 0. Self-contained. **Part A** = Jini monorepo (sections 0-6).
**Part B** = Tovu (section 7), run only after Part A is reviewed, Jini is released and Tovu's `@jini-ai/*`
versions are bumped. Paths and lines were read on Jini branch `design-d5` (head 9a2bcb954) and Tovu at
9286dc3f5; if a line moved, find the quoted text in the same file. Neither repo needs `AI-Dev-Shop/`; that is
expected, proceed. Do not follow CLAUDE.md/AGENTS.md bootstrap steps.

**What changed in rev 4.** The shared pieces are now safe by construction (Jini 76801d6ed, 74867d4cc,
3c06a063f, 9a2bcb954): `describeErrorForLog` can only print fixed class labels and approved codes;
`createConsoleLogger` and the desktop-host file logger print that metadata only; the route owner and the
settlement port hand the host the full error. So this lane only moves the remaining RAW paths (code that
prints or exports a caught value's text itself) onto those pieces. No per-row safety judgement is left.
**79 rows** (section 5) plus whatever the section 5f search finds. Everything else from rev 3 is a
separate later lane (section 6).

## 0. Preconditions (check first; if one fails, STOP and report which)
- **P1 safe describer.** `grep -n "registerLoggableErrors" packages/core/src/model-facing-tool-errors.ts` matches
  and `grep -n "constructor.name" packages/core/src/model-facing-tool-errors.ts` does not.
- **P2 safe default loggers + route owner.** `packages/core/src/primitives/logger.ts` exports `describeLogMeta`;
  `packages/desktop-host/src/logging.ts` has no `error.message`; `packages/http-kit/src/internal-error.ts` exports
  `reportRouteInternalError` and puts `logSource` in the sink context.
- **P3 red, then green, recorded.** For each pair in `jini-errors.md` (sequence section) the cloud gate has
  recorded the failing assertion on the test-only revision and the pass on the fix. Ask for the records; do not
  run the pairs yourself.
- Run Part A on a branch made from `refactor/terra` with `design-d5` merged in.

## 1. Ground rules
- Smallest change per row. No renames, moves or reformatting. Keep every comment; a "why" comment on code you
  replace moves with the code.
- Every function you add or change: at most 50 lines; cyclomatic AND cognitive complexity at most 10 (admin
  package: at most 9/9). API args are `(requiredObj, optionalObj = {})`, also for private helpers. No
  `eslint-disable` (except the `no-console` lines already on a default sink, which move with it), no `as any`,
  no non-null `!`.
- Helpers allowed, no others: `describeErrorForLog({ err })` and `LOGGABLE_ERROR_CODES` (`@jini-ai/core`; browser
  files import from `@jini-ai/core/model-facing-tool-errors`), `reportRouteInternalError` (`@jini-ai/http-kit`),
  the core `Logger` port, and the LB `errorClassLabel` (section 3) where core cannot be imported. Never
  `formatErrorForLog`, `inspect(x)`, `String(x)`, `x.message`, `x.name`, `x.stack`, `x.constructor`, or a raw
  `x.code` of a caught value in a log line, report, telemetry attribute, manifest or cause text.
- A package that imports a Jini package it does not declare gets the declaration (package.json + the
  `pnpm-lock.yaml` importer entry, copied from a sibling). Never a dynamic `import()` or optional peer.
- Agent-plugin `.mjs` files and skill `scripts/*.mjs` are self-contained: they import nothing from `@jini-ai/*`.
- Tests: ONE file at a time, never a suite, never a full tsc; leave nothing running. vitest:
  `npx vitest run --maxWorkers=2 --minWorkers=1 <file>` from the package dir; node:test files:
  `node --import tsx --test --test-concurrency=1 <file>`. If `@jini-ai/core` resolves to a stale dist, point it at
  `packages/core/src` with an UNTRACKED per-package config; never commit it.
- Per changed source file, one test in the nearest existing test file: write it, SEE RED, fix, GREEN, mutate
  (undo the fix's key line) and SEE RED, restore. Record each run (command + the failing/passing assertion line).
  The secret input is `new Error("boom api_key=SECRETSECRETSECRETSECRET")`; assert `boom`, `SECRETSECRET` and the
  test file name (a stack frame) are absent from every printed/exported argument. Update existing tests that pin
  the old full text (`rg -n "stringContaining\('Error: |toContain\('boom'\)" <package>/src`) in the same change.
- Do not commit, push, stash, `git add -A` or `git checkout`. Leave changes in the tree.

## 2. The rule this lane enforces
A log line, report, telemetry attribute or stored diagnostic says what failed (fixed words), the IDs it has, and
`describeErrorForLog` of the caught value: never the value's text. Full detail goes to the HOST: a typed throw
with `cause`, an injected sink/port, or the `error` bag of a `Logger` (Jini's default loggers print it as class
only; a host logger is the host's channel and policy). Why: a caught error's text can quote untrusted input or a
credential no redaction pattern knows; three reviews found such rows each time detail was printed by default.

## 3. Variants
- **LOG-TEXT** (console or a one-string port): replace the WHOLE expression that formats the caught value
  (`redactSecrets({ input: inspect(x) }, ...)`, `formatErrorForLog({ error: x })`,
  `x instanceof Error ? x.message : String(x)`, `redactSecrets({ input: x.message }, ...)`) with
  `describeErrorForLog({ err: x })`, where `x` is the value it formatted (e.g. `scheduledRunFailureDetail(error)`
  at `scheduler.ts:185`); keep the fixed text, labels and IDs. In a template string the words around
  it stay (`'...: ${describeErrorForLog({ err })} — skipped'`). Remove `inspect`/`redactSecrets`/`formatErrorForLog`
  imports only when nothing else in the file uses them.
- **LOG-PORT** (a core `Logger`: `logger.warn({ message }, { meta, error })`): the message keeps only its fixed
  words and IDs; the original value goes in the `error` bag (`{ error: x }`), unformatted.
- **LB** (no core import possible): one module-level function per bundle, plain JS:
  ```js
  const LABELS = [[AggregateError, 'AggregateError'], [TypeError, 'TypeError'], [RangeError, 'RangeError'], [SyntaxError, 'SyntaxError']];
  /** A fixed label for a caught value, chosen by class checks. Never reads message, stack or a
   * constructor name (caller-controlled text); reads `name` once, only to match two fixed names. O(1). */
  export function errorClassLabel({ error }, _optional = {}) {
    try {
      if (!(error instanceof Error)) return typeof error;
      const known = LABELS.find(([type]) => error instanceof type);
      if (known) return known[1];
      const name = readNameOnce({ error });
      return name === 'AbortError' || name === 'TimeoutError' ? name : 'Error';
    } catch { return '[diagnostic unavailable]'; } // The original failure must stand, never a lookup error.
  }
  function readNameOnce({ error }, _optional = {}) { try { return error.name; } catch { return undefined; } }
  ```
- **HELPER**: a function that builds diagnostic text from a caught value (section 5b) returns
  `describeErrorForLog`-based text instead; its callers do not change.
- **CN**: section 5e.

## 4. Worked examples
- Describer + default loggers: `packages/core/src/model-facing-tool-errors.ts`, `src/primitives/logger.ts`,
  `packages/desktop-host/src/logging.ts`, tests `describe-error-for-log.test.ts`, `primitives/__tests__/defaults.test.ts`,
  `desktop-host/src/__tests__/logging.test.ts` (74867d4cc red, 9a2bcb954 fix).
- CN: `packages/http-kit/src/internal-error.ts` + `__tests__/internal-error.test.ts`; caller
  `packages/daemon/src/http/tool-execution-routes.ts` catalog catch, test `src/http/__tests__/tool-execution-rpc.test.ts`.
- LOG-TEXT with the host handover: `packages/commerce/src/payments/ingest/settlement-worker.ts`
  (`warn(text, { error })`), test `__tests__/settlement-worker.unit.test.ts`.

## 5. Rows (79)
### 5a. Existing full-text log lines (49; LOG-TEXT unless marked)
- agent-plugins: `src/connect/import-access-token.ts:159`, `src/connect/grant-signed-in-defaults.ts:155`,
  `src/connect/apply-tool-renames.ts:130,149`, `src/lifecycle/host-tools/search-tool.ts:218`, `src/lifecycle/host-tools/skill-tool.ts:297`
- agent-runtime: `src/providers/oauth-tokens.ts:88,129`, `src/providers/oauth-callback-server.ts:145`
- chat: `src/store/runtime/chat-expiry-sweep.ts:66`; browser: `src/react/hooks/useRunStream.ts:52`,
  `src/react/hooks/useConversation.ts:165`, `src/react/components/ConversationTitleEditor.tsx:39`, `ToolCard.tsx:120`,
  `Composer.tsx:116`, `ExtEventErrorBoundary.tsx:43`, `ConversationList.tsx:78`,
  `src/react/features/chat-pane/hooks/useChatPaneFileDrop.hooks.ts:39,43`
- cms: `src/forms/submit-service.ts:281,291` (LOG-PORT: `{ error: cleanupError }` / `{ error }`),
  `src/forms/notify-subscriber.ts:124` (section 5c), `src/comments/express/submit-handler.ts:134`, `src/forms/express/handler.ts:279`
- daemon: `src/run-lifecycle.ts:730,733,806,812,852,857` (the lifecycle's default lines; its `onInternalError`
  sink still gets `{ source, runId, error }`); `src/http/frontend-control.ts:140` `defaultBindErrorSink`;
  `src/routines/scheduler.ts:185,297`
- db: `src/kernel/postgres/driver.ts:36`
- mcp: `src/core/config.ts:243`, `src/core/tokens.ts:200`, `src/federation/bootstrap.ts:321,348` (LOG-PORT: the
  `— ${...}` tail leaves the message; `{ error }` goes in the bag)
- plugins: `src/host/node/runtime-core.ts:641,646,671,821` (`:646` keeps its redacted plugin-id label),
  `src/host/contributions.ts:204`, `src/host/tools/management.ts:376,397`
- server: `src/create-local-node-daemon.ts:396`, `src/host-bootstrap.ts:180`
- ui (browser): `src/features/sketch-editor/react/hooks/useSketchSaveWorkflow.ts:128`,
  `src/features/lexical-rich-text-editor/react/components/RichTextInput.tsx:264`
Pinned tests to update with them (at least): daemon `src/__tests__/run-lifecycle-event-drop.test.ts:70`,
`src/__tests__/run-lifecycle-slow-run-watchdog.test.ts:274`.

### 5b. Helper-built diagnostics (7 rows in 5 places)
- `integrations/src/webhooks/worker.ts:92-101` `describeWebhookTickError`: return
  `` `${WEBHOOK_DELIVERY_FAILED_LINE}: ${describeErrorForLog({ err: error })}` `` (drop the URL/word scan, the cap and
  the raw code; delete constants nothing else uses). The `:130` caller is unchanged. Update `worker.test.ts:109-113`.
- `db/src/pglite/socket-server.ts:393`: `` `socket server error: ${describeErrorForLog({ err: error })}` ``.
- `agent-plugins/src/admin-surfaces/connections/connections.ts:112`: the warn's tail `${codeOf(error)}` becomes
  `${describeErrorForLog({ err: error })}`. `codeOf` and `failedAttempt` (`:30-39`) do NOT change: the stored attempt
  is the admin status answer (own lowercase codes, else `sign-in-failed`), not a log. Test: an error with code
  `SECRETSECRETSECRETSECRET` -> the warn has no `SECRETSECRET`; the stored attempt code stays `sign-in-failed`.
- `diagnostics/src/observability/otel.ts:15-22` `errorType`/`fallbackErrorLabel`: `errorType` returns
  `describeErrorForLog({ err: error }).split(" cause=")[0]` (e.g. `TypeError(ECONNRESET)`), redacted and capped as
  today; delete `fallbackErrorLabel` and the inline code regex; update the doc comment. Update the pinned tests in
  `src/__tests__/observability-operations.test.ts`: `:164` label -> `"TypeError"` (the unapproved code is dropped),
  `:177` -> `"TypeError(ECONNRESET)"`, `:181` -> `"Error"` (a custom `name` is never read); `:178`, `:182` unchanged.
- `diagnostics/src/observability/delivery.ts:36` `describeTelemetryFailure`: read `name`, `statusCode`, `status`,
  `code` ONCE each into locals inside the existing `try`, then decide from the locals. Test: a `name` getter that
  returns an allowed class first and `SECRETSECRETSECRETSECRET` after gives the allowed class and is read once.

### 5c. Form notification (1, plus the 5a helper row)
`cms/src/forms/notify-subscriber.ts`. Provider refusals can echo credentials or private input, and pattern
redaction cannot remove arbitrary values. The `:124` helper `warn(logger, message, error?)` becomes
`warn({ logger, message }, { error } = {})` with body `logger.warn({ message }, error === undefined ? {} : { error })`
inside the existing try (keep its catch). Update its doc comment: the message carries fixed words and IDs only; the
refusal detail travels as the error object to the host's logger. `:172`:
`` warn({ logger: deps.logger, message: `[forms:notify] mail send failed for submission '${submissionId}' recipient '${recipient}'` }, { error: Object.assign(new Error(result.message), { code: result.errorCode }) }); ``
(the default logger prints `Error`, or `Error(CODE)` only for an approved code). Move the helper's other callers to
the object form. Test (its existing test file): a refusal `{ ok: false, errorCode: 'X', message: 'refused PRIVATEVALUE' }`
with `createConsoleLogger` -> `PRIVATEVALUE` in no console argument; with a recording `Logger` -> the message has no
`PRIVATEVALUE` and `error.message === 'refused PRIVATEVALUE'`.

### 5d. Web-clone CLI scripts (8; LB)
`agent-runtime/src/skills/web-clone/scripts/`. A new `lib/error-label.mjs` holds the section 3 `errorClassLabel`;
each script imports it like its other `lib/` modules. Replace the caught value's text with
`errorClassLabel({ error: e })` at: `mirror-site.mjs:64` (`goto:`), `:94` (the `tally.failed` entry, printed at `:113`);
`asset-harvest.mjs:215` (the `error:` field, printed at `:307`), `:243` (`goto:`), `:381`; `dna-scaffold.mjs:229`
(the recon parse can quote file contents), `:262`; `lib/main-guard.mjs:55`. Keep the URL/path words around them.
Test: a new `scripts/__tests__/error-label.test.mjs` (node:test): built-in classes, a throwing `name`, a `name` of
`SECRETSECRETSECRETSECRET`, a revoked Proxy, a non-Error; plus one case in the nearest existing script test that a
failing `goto` prints `goto: Error` and no `boom`.

### 5e. CN: one incident owner for every route pack (14 files)
Each pack has its own default sink (full text) and most answer `"an internal error occurred"`. Route each through
`reportRouteInternalError({ report, logSource, message }, { onInternalError: deps.onInternalError })`:
- KEEP each pack's exported `XInternalErrorContext` type, its `onInternalError` dep and all doc/why comments (move a
  sink's why-comment onto the call). `report` = the context's own fields minus `correlationId`; if TS cannot infer,
  pass `reportRouteInternalError<Omit<XInternalErrorContext, 'correlationId'>>(...)`. The host sink also receives
  `logSource` (additive).
- DELETE the local default sink and the local `randomUUID()` + sink call; keep a local wrapper only when it picks the
  message. `logSource` = the label the old default line printed. `message` = the row's words, never
  `"an internal error occurred"`. In the table's code, `logSource` and `message` stand for that row's values.

| File | Sources -> message (all end with " Try again; if it keeps failing, copy the request ID and report this problem." unless written out) | logSource |
|---|---|---|
| `daemon/src/http/runs.ts:43,88` | keep its two existing messages | `source` |
| `daemon/src/http/attachments.ts:1422,1430` | `attachment-upload` "The file could not be attached."; `attachment-cleanup` "The attachment could not be removed." | `source` |
| `daemon/src/http/attachment-lookup-routes.ts:64` | add `onInternalError?: RouteInternalErrorSink` to the optional deps; `sendLookupFailure(res, error)` becomes `sendLookupFailure({ res, error }, { onInternalError } = {})`; unexpected failure (not `AttachmentRejectedError`): report `{ source: 'attachment-lookup', error }`, "The attachment could not be looked up." | `attachment-lookup` |
| `daemon/src/http/media.ts:170,175` | `media-generate-dispatch` "The media could not be generated."; `media-task-store` "The media task could not be read or saved. Reload to check the task; if it keeps failing, copy the request ID and report this problem." | `source` |
| `daemon/src/http/terminals.ts:58,92` | `terminal-create` "The terminal could not be opened." | `source` |
| `daemon/src/http/db-ops.ts:197,239` | `db-inspect` "The database could not be inspected."; `db-verify` "The database check could not finish."; `db-vacuum` "The database could not be compacted." | `source` |
| `daemon/src/http/connectors.ts:139,164` | report `{ source, operation, error }`; by `source`: `auth` "The sign-in provider could not finish this request."; `storage` "The file storage provider could not finish this request."; `db` "The database provider could not finish this request."; `realtime` "The realtime provider could not finish this request." | `` `connectors/${source}.${operation}` `` |
| `daemon/src/http/remote-run-events.ts:59,235` | `tool-use` "The tool call could not be recorded for this run. Check the run status; copy the request ID and report this problem."; `tool-result` same with "tool result" | `` `remote-run-events/${source}` `` |
| `daemon/src/http/research.ts:153,236` | "The web research request could not be completed." (report `{ error }`) | `research/search` |
| `daemon/src/http/xai.ts:217` + every `resolved.onInternalError({...})` (340, 358, 460, 520, 571, 590, 785, 801) | `oauth-start` "xAI sign-in could not start."; `oauth-complete` "xAI sign-in could not be completed."; `oauth-disconnect` "xAI could not be disconnected."; `auth-status` "The xAI connection status could not be read."; `search` "The X search could not be completed." Keep every `redactError(error)` wrapper. Each call becomes `` const apiError = reportRouteInternalError({ report: { source, error }, logSource: `xai/${source}`, message }, { onInternalError: resolved.onInternalError }); `` and the answer uses `apiError` in place of the `createApiError(... INTERNAL_ERROR_MESSAGE ...)`. Calls with no HTTP answer (340, 358) ignore the return value. `ResolvedXaiHttpDeps.onInternalError` (`:214`) becomes optional and `:249` passes `deps.onInternalError` with no default. Delete `INTERNAL_ERROR_MESSAGE`. | `` `xai/${source}` `` |
| `daemon/src/http/delegated-tools.ts:157,182` | "The tool could not run because of a server fault. Do not retry the same call; tell the user to copy the request ID and report this problem." Keep `describeSafely` precedence: `const apiError = reportRouteInternalError({ report, logSource: report.source, message }, { onInternalError: deps.onInternalError }); const described = describeSafely(deps, { ...report, correlationId: String(apiError.requestId) }); return described === undefined ? apiError : createApiError({ code: 'INTERNAL_ERROR', message: described }, { requestId: apiError.requestId });`. `describeSafely`'s own line (`:176`) is LOG-TEXT. | `source` |
| `daemon/src/http/model-proxy.ts:156,452,579,645` | KEEP its message: hoist the existing "The assistant response stopped. ..." text (`:382`, `:465`) into one module `const` and use it at both places and as `message`. Report `{ provider, error }`. `:645` passes `deps.onInternalError` with no default; the `InternalErrorSink` params at `:407`, `:603` become optional. `:451-452`: `const correlationId = String(reportRouteInternalError({ report: { provider, error }, logSource, message }, { onInternalError }).requestId);` (the rest is unchanged). `reportCatchAllError` becomes `({ providerParam, error }, { onInternalError } = {})`: `isRecognizedProvider(providerParam)` ? the owner with `{ onInternalError }` : the owner WITHOUT a sink (keep its why-comment); returns `String(apiError.requestId)`. `:638` calls it in the object form. | `` `model-proxy/${provider \|\| 'unknown'}` `` |
| `daemon/src/http/frontend-sessions.ts:132,336-340` | stream: "The page connection could not be opened. Reload the page; if it keeps failing, copy the request ID and report this problem." Pre-header answer `res.status(500).json({ error: apiError })`. The local wrapper and its sink-failure catch go. **Facade:** `daemon/src/http/frontend-control.ts:78` adds `'onInternalError'` to the `session` Pick (the facade already spreads `options.session` into the route deps at `:172`). Test in `frontend-control.test.ts`: a `session.onInternalError` receives a failing stream's `{ source, error, correlationId, logSource }` and the answer carries the same `requestId`. | `` `frontend-sessions:${source}` `` |
| `http-kit/src/adapter.ts:38,205` | keep its message; report `{ method: spec.method, path: spec.path, error: e }` | `` `${spec.method.toUpperCase()} ${spec.path}` `` |

Test per file (its existing test file): status + exact message; response `requestId` === the sink's `correlationId`;
the sink gets the route's fields + the original error (`toBe`); with no sink the default line is
`internal error (<logSource>, correlationId=<id>) Error` with no `boom`, no stack, no `SECRETSECRET`. Update
assertions that pinned `'an internal error occurred'` (e.g. `src/http/__tests__/remote-run-events.test.ts:483`).

### 5f. Find the raw paths nobody listed (do this before 5a)
```
rg -n "\b(e|err|error|cause|reason|\w+Error|\w+Err)\.(message|name|stack|code)\b|constructor\.name|inspect\(|formatErrorForLog\(|String\((e|err|error|reason)\)|console\.\w+\([^)]*,\s*(e|err|error|reason)\)" packages --glob '!**/__tests__/**' --glob '!**/*.test.*' --glob '!core/src/model-facing-tool-errors.ts'
```
A hit is a row when the value reaches a log, console, report, telemetry attribute, stored diagnostic or manifest,
directly or through a helper, callback or intermediate string: fix it with the matching variant and list it in the
report. A hit that only reaches a thrown message, a returned user-facing result or a host port is not this lane:
list it under "not this lane" with one line why. Rows already in 5a-5e are not repeated.

## 6. Not this lane (say so in the report)
These rev 3 rows are separate work, not the leak class; the full list stays in rev 3 (Tovu commit 9286dc3f5, this
file, sections 5-9): swallowed errors that gain a log (LS 41, RES-LS 15, MCP MR 3), cause handover (R 5, RS 6,
memory 2; RS needs no separate secret judgement any more, since no default sink prints a cause's text), admin copy
(U 8), special sites (S 3, P 1, Q 4), comment-only drops (C 145), R-API constructors, DEP-chat, and Part B T4/T6.
Express contracts in daemon/http-kit and xAI vendor behaviour in daemon are covered by the server-port plan
(`core/contracts/server.ts`) and the vendor-adapter rule, not here.

## 7. Part B, Tovu (separate run, AFTER Part A is reviewed, Jini is released and Tovu bumps `@jini-ai/*`)
Same ground rules. Single-file tests: website `node --import tsx --test --test-concurrency=1 <file>` from the repo
root; desktop from `apps/desktop`: `node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`.
Every test feeds `new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRETSECRET01")`.
- **T1 Tovu's incident sink: full record stored, console summary metadata-only.** New
  `apps/website/src/platform/server-logs/jini-incident.ts` exporting
  `logJiniIncident(incident: { readonly error: unknown; readonly correlationId?: string } & Readonly<Record<string, unknown>>, { buffer = getServerLogBuffer(), source = "server" }: { readonly buffer?: Pick<ServerLogBuffer, "append">; readonly source?: ServerLogSource } = {}): string`:
  1. `id = incident.correlationId ?? randomUUID()` (a route incident keeps Jini's request ID unchanged; a lifecycle
     incident has none and gets one).
  2. `context` = `key=value` for each of `logSource, source, operation, provider, method, path, runId, batchId` whose
     value is a string (Jini-built labels and IDs; `runId` is kept).
  3. Stored record, in its own try/catch: `buffer.append({ level: "error", source, message: \`[jini incident ${id}] ${context} ${formatErrorForLog({ error: incident.error }, TOVU_ERROR_REDACTION_OPTIONS)}\` })`
     (Tovu's redaction policy; the buffer redacts again and persists to the site's rotating log file when
     `attachServerLogFile` is active).
  4. Console summary, in its own try/catch: `console.error(\`[jini] internal error (${context}, correlationId=${id})\`, describeErrorForLog({ err: incident.error }))`.
  5. Return `id`. Never throws. Assignable to every one-argument `onInternalError` port.
  Wire `onInternalError: incident => { logJiniIncident(incident); }` at: `agent-daemon-scope.ts` `:282`
  `createRunLifecycle`, `:1434` the `adapter` object, `:357` `createFrontendControl` `session`, `:1468`
  `registerRunRoutes`, `:1519` `delegatedToolRouteDeps`, `:1602` `registerAttachmentRoutes`;
  `runtime/composition/modules/assistant-tool-exec.ts:88`; `assistant/site/visitor-frontend-control.ts:29` `session`;
  `assistant/daemon-access.ts:71` `registerAttachmentLookupRoutes`; desktop `apps/desktop/src/desktop-agent.ts`
  `:341`, `:370`, `:372` (import in the file's existing `../../website/src/...` relative style). In Electron main the
  record lands in the in-memory process buffer unless a log file is attached there: say which in the report.
  Commerce: `runtime/composition/commerce.ts:74` default `warn` becomes
  `(message, detail = {}) => { console.warn(\`[commerce] ${message}\`); if (detail.error !== undefined) logJiniIncident({ error: detail.error, logSource: "commerce" }); }`
  with type `(message: string, detail?: { readonly error?: unknown }) => void`.
  Tests, new `server-logs/__tests__/unit/jini-incident.unit.test.ts` (a real `createLogBuffer` with
  `redactSecretShapes`; console recorded and restored in `finally`):
  (a) **response ID -> stored record**: `const apiError = reportRouteInternalError({ report: { source: "attachment-upload", runId: "r1", error }, logSource: "attachment-upload", message: "m" }, { onInternalError: incident => { logJiniIncident(incident, { buffer }); } });`
  then exactly one buffer entry contains `String(apiError.requestId)`; it contains `boom`, `runId=r1`,
  `logSource=attachment-upload` and the test file name (stack), and not `SECRETSECRETSECRET`; the console summary
  contains the same ID and `Error`, and not `boom`.
  (b) **lifecycle correlation**: `logJiniIncident({ source: "inactivity-timeout", runId: "run-1", error }, { buffer })`
  returns an ID; the stored record and the console summary both contain that ID and `runId=run-1`.
  (c) a throwing `buffer.append` still prints the summary and does not throw.
  Wiring check (source-text test in the style of `main-owner-store-wiring.test.ts`): both `createFrontendControl`
  calls pass `onInternalError` in `session`.
- **T3 Electron main gets a redacting console.** Unchanged from rev 3 (Tovu 9286dc3f5, section 10 T3): new
  `apps/desktop/src/main/boot/console-redaction.ts` `installMainConsoleRedaction`, called first in
  `apps/desktop/src/main/index.ts`, with its two tests.
- Not in scope (say so): CLI one-shot commands other than `serve` print to the operator's terminal without a tee.

## 8. Report (final message)
Per row: done / skipped (why) / variant changed (why). Section 5f hits: fixed (variant) and not-this-lane (why).
Per test file: red, green, mutation-red evidence (command + assertion line of each run; "not run" is a failed
step). Files changed. Nothing else.
