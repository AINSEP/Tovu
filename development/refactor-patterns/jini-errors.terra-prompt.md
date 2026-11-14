- BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). Bootstrap files (AI-Dev-Shop/AGENTS.md, CLAUDE.md/AGENTS.md startup steps) do not apply and may be missing; expected. This prompt is complete; proceed.

# Terra prompt: Jini errors rev 5, burn down the log-safety debt list

STATUS: DRAFT rev 5 (2026-11-13), NOT READY until the coordinator's re-review. Self-contained.
**Part A** = Jini monorepo, five batch jobs (A1-A5, section 6); each job runs ONE batch, named in its dispatch.
**Part B** = Tovu (section 8), run only after Part A is reviewed and Jini is released; it lands in the SAME
commit as Tovu's `@jini-ai/*` bump. Paths were read on Jini `design-d5` (head a4472d838) and Tovu 5ea85d833;
if a line moved, find the quoted text in the same file.

**What changed in rev 5.** The shared pieces are safe by construction (rev 4) and now also project nested
metadata (`describeLogMeta`, desktop-host `projectForLog`), so no default sink can print a caught value's text.
Raw paths are found by a gate instead of a hand-made list: `scripts/check-log-safety.mjs` (ESLint core rules)
and its checked-in debt list `scripts/log-safety-debt.json` (229 file/rule entries, 368 paths, 130 files), which
may only shrink. Part A clears that list file by file. Rows the gate cannot see stay explicit (section 5).

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
- **P4 gate adopted on the merged base** (coordinator, before dispatch): branch from `refactor/terra` with
  `design-d5` merged; `LOG_SAFETY_BASE_REF=<refactor/terra tip before the merge> node scripts/check-log-safety.mjs --update`
  committed; CI step `log safety (blocking ratchet)` after `size (blocking ratchet)` (env `LOG_SAFETY_BASE_REF` /
  `LOG_SAFETY_FIRST_PUSH_COMMIT` like the `SIZE_*` pair, run `pnpm check:log-safety`).
- **P5 work list.** The dispatch carries the `node scripts/check-log-safety.mjs --list` lines (with line numbers)
  for this batch's files, generated on the P4 base. If they differ from section 6, the dispatch's list wins. No
  list attached: use section 6 and find each entry by reading the file for its rule's pattern (section 3).

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
- A package that imports a Jini package it does not declare gets the declaration (package.json + the
  `pnpm-lock.yaml` importer entry copied from a sibling). Never a dynamic `import()` or optional peer.
  Agent-plugin `.mjs` files and skill `scripts/*.mjs` import nothing from `@jini-ai/*`.
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

## 5. Explicit rows the gate cannot see (do them in the batch that owns the file)
### 5a. Helpers (A2, A3, A4)
- A2 `integrations/src/webhooks/worker.ts:92-101` `describeWebhookTickError`: return
  `` `${WEBHOOK_DELIVERY_FAILED_LINE}: ${describeErrorForLog({ err: error })}` `` (drop the URL/word scan, the cap
  and the raw code; delete constants nothing else uses). The `:130` caller is unchanged; update `worker.test.ts:109-113`.
- A2 `diagnostics/src/observability/otel.ts:15-22` `errorType`: returns
  `describeErrorForLog({ err: error }).split(" cause=")[0]`, redacted and capped as today; delete
  `fallbackErrorLabel` and the inline code regex; update the doc comment and the pinned tests in
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

## 6. Batches (one job each; packages are disjoint, so jobs may run in parallel)
Entries are `file rule:count` under `packages/`. Do every entry of your batch plus its section 5 rows.
- **A1 route packs (16 files, 51 paths) + 5d.** `daemon/src/http/`: `attachment-lookup-routes.ts stored-error-text:1`
  (refusal answer: not this lane), `attachments.ts`, `connectors.ts`, `db-ops.ts`, `frontend-control.ts`
  (`:140 defaultBindErrorSink` LOG-TEXT), `remote-run-events.ts`, `research.ts`, `runs.ts`, `terminals.ts`, `xai.ts`
  (each `console:1 error-format:1 error-helper:1`), `delegated-tools.ts console:2 error-format:2 error-helper:2 stored-error-text:1`,
  `frontend-sessions.ts console:2 error-format:2 error-helper:2`, `host-tools.ts stored-error-text:2`,
  `media.ts console:1 error-format:1 error-helper:1 stored-error-text:1`; `http-kit/src/adapter.ts console:1 error-format:1 error-helper:1`,
  `http-kit/src/verified-origin/configured-origin.ts raw-error:1`.
- **A2 daemon runtime, core, hosts (21 files + otel.ts, delivery.ts; 68 paths) + 5a A2 rows.**
  `daemon/src/agent-executor/`: `event-translation.ts stored-error-text:1`, `events.ts console:2 error-helper:1`,
  `http-mcp.ts console:3`, `launch.ts console:3`, `run-output.ts console:1 error-format:1 error-text:1`;
  `daemon/src/legacy-data-migration.ts console:1`; `daemon/src/routines/scheduler.ts console:2 error-format:2 error-helper:2`
  (`:185` formats `scheduledRunFailureDetail(error)`); `daemon/src/run-lifecycle.ts console:6 error-format:6 error-helper:6`
  (its `onInternalError` sink keeps `{ source, runId, error }`; pinned tests `src/__tests__/run-lifecycle-event-drop.test.ts:70`,
  `run-lifecycle-slow-run-watchdog.test.ts:274`); `core/src/approval.ts stored-error-text:2`;
  `core/src/primitives/logger.ts error-text:1` (`:116 record.message`: false positive); `core/src/settings/express/stream.ts console:1 error-format:1 error-helper:1`;
  `server/src/create-local-node-daemon.ts console:1 error-format:1 error-helper:1`; `server/src/host-bootstrap.ts error-format:1 error-helper:1`;
  `sidecar/src/json-ipc.ts console:2`; `desktop-host/src/electron/updates/auto-update-controller.ts error-helper:6`;
  `infra/src/events/outbox/worker.ts error-text:1 stored-error-text:1`; `integrations/src/webhooks/worker.ts console:1`;
  `commerce/src/payments/ingest/worker.ts stored-error-text:1`; `diagnostics/src/observability/tracker.ts console:1`;
  `diagnostics/src/sources.ts stored-error-text:2`; `diagnostics/src/web-evidence/playwright-runtime.ts stored-error-text:4`.
- **A3 data, platform, plugins host (27 files, 73 paths) + 5a A3 row.** `db/src/data-modules/data-module.ts console:1 stored-error-text:2`,
  `db/src/kernel/postgres/driver.ts console:2 error-format:1 error-helper:1`, `db/src/pglite/socket-server.ts error-text:1`,
  `db/src/tools/transfer-tools.ts error-helper:3`; `mcp/src/core/config.ts`, `mcp/src/core/tokens.ts` (each
  `console:1 error-format:1 error-helper:1`), `mcp/src/federation/bootstrap.ts error-format:2 error-helper:2` (LOG-PORT:
  the `— ${...}` tail leaves the message), `mcp/src/federation/stdio/default-connect.ts console:1`;
  `platform/src/fs/directory-user-config.ts console:1`, `platform/src/fs/durable-json.ts console:1 error-format:1`,
  `platform/src/fs/workspace-directory.ts console:1`, `platform/src/mail/builtin-providers.ts console:1`,
  `platform/src/mail/delivery-wrapper.ts console:1`, `platform/src/mail/resolve-mailer.ts console:1 stored-error-text:2`;
  `devops/src/agent-jobs/jobs.ts stored-error-text:4`, `devops/src/deploy/ops-runner.ts console:1`;
  `plugins/src/host/capability-tools.ts console:1 error-format:1 error-text:1 stored-error-text:2`,
  `plugins/src/host/contributions.ts console:1 error-format:1`, `plugins/src/host/node/install.ts console:2`,
  `plugins/src/host/node/runtime-core.ts console:7 error-format:6 error-text:3 raw-error:1` (`:646` keeps its redacted
  plugin-id label; `:736` provider-load exception), `plugins/src/host/tools/management.ts console:2 error-text:2`,
  `plugins/src/host/worker/run-call.ts stored-error-text:2`; `agentic/src/core/dom/dom-page-driver.ts console:1`;
  `analytics/src/product/index.ts console:1`; `user-management/src/admin/controllers/auth.controller.ts stored-error-text:1`;
  `ui-kit/src/react/confirm/ConfirmDialog.hooks.ts console:1`, `ui-kit/src/react/context.ts console:1`.
- **A4 agent plugins + runtime (31 files + `lib/main-guard.mjs`; 92 paths, about 40 plain CLI `console` KEEP) + 5a A4, 5c.**
  `agent-plugins/src/`: `admin-surfaces/connections/connections.ts console:1 error-helper:1`,
  `connect/apply-tool-renames.ts error-format:2 error-text:2`, `connect/credential-cards.ts console:2`,
  `connect/federate-mcp.ts stored-error-text:2`, `connect/grant-signed-in-defaults.ts error-format:1 error-text:1`,
  `connect/import-access-token.ts error-format:1 error-text:1`, `connect/plugin-credential-card.ts console:1`,
  `lifecycle/credential-card-metadata.ts console:1 stored-error-text:1`, `lifecycle/host-tools/identity.ts console:2`,
  `lifecycle/host-tools/search-tool.ts console:2 error-format:2 error-text:2`, `lifecycle/host-tools/skill-tool.ts console:2 error-format:1 error-text:1`,
  `lifecycle/retire-bundled.ts stored-error-text:2`, `lifecycle/seed-bundled.ts stored-error-text:2`.
  `agent-runtime/src/`: `agent-protocol/pi-rpc/session.ts console:1`, `anthropic-live-models.ts console:1`,
  `providers/oauth-callback-server.ts console:1 error-format:1 error-helper:1`, `providers/oauth-tokens.ts console:2 error-format:2 error-helper:2`,
  `terminal-launch.ts stored-error-text:4`; `skills/web-clone/scripts/`: `asset-harvest.mjs console:3 error-text:1`,
  `audit-clone.mjs console:2 error-text:1`, `compare-recon.mjs console:2 error-text:1`, `dna-scaffold.mjs console:3 error-text:2`,
  `init-clone.mjs console:2 error-text:1`, `interaction-probe.mjs console:3 stored-error-text:1`, `route-crawl.mjs console:3 stored-error-text:1`,
  and `console:3` each in `mirror-site.mjs`, `network-capture.mjs`, `od-preview-rewrite.mjs`, `recon-site.mjs`,
  `sourcemap-hunt.mjs`, `visual-diff.mjs` (scripts use `errorClassLabel`, never core).
- **A5 chat, UI, admin, CMS (35 files, 84 paths) + 5b.** `chat/src/`: `core/assistant-client/ag-ui-transport.ts stored-error-text:1`,
  `embed-widget/vanilla/state.ts stored-error-text:1` (visitor bundle: no core import, no console), `console:1 error-format:1` each in
  `react/components/{Composer,ConversationList,ConversationTitleEditor,ExtEventErrorBoundary,ToolCard}.tsx`,
  `react/hooks/{useConversation,useRunStream}.ts`, `react/features/chat-pane/hooks/useChatPaneFileDrop.hooks.ts console:2 error-format:2`,
  `store/runtime/chat-expiry-sweep.ts console:1 error-format:1 error-helper:1`.
  `ui/src/features/`: `asset-grid/react/hooks/useAssetGridLiveUpdates.ts console:1`, `connectors/hooks/useConnectorCatalog.ts console:2`,
  `html-editor/editor-serialization.ts console:1 raw-error:1`, `lexical-rich-text-editor/react/components/RichTextInput.tsx console:1 error-format:1`,
  `panel-kit/helpers/standing-draft-local-backup.ts console:1`, `panel-kit/hooks/use-settings-slice.hooks.ts console:1`,
  `panel-kit/hooks/use-standing-draft-autosave.hooks.ts console:1`, `sketch-editor/react/hooks/useSketchSaveWorkflow.ts console:1 error-format:1`;
  `ui/src/react/components/RemixIcon.stylesheet.ts console:1`.
  `admin/src/`: `core/transport/errors.ts console:1`, `core/transport/http.ts stored-error-text:3`, `media/controllers/edit-media.controller.ts stored-error-text:1`,
  `media/controllers/library.controller.ts stored-error-text:3`, `seo/controllers/sitemap.controller.ts stored-error-text:1`,
  `widgets/react/hooks/use-widget-regions.hooks.ts stored-error-text:1`, `widgets/react/hooks/use-widgets-library.hooks.ts stored-error-text:1`
  (admin `stored-error-text` is mostly UI state or an error body: not this lane unless it is a log/report).
  `cms/src/`: `comments/express/submit-handler.ts console:1 error-format:1 error-helper:1`,
  `forms/express/handler.ts console:1 error-format:1 error-helper:1 stored-error-text:6`, `forms/notify-subscriber.ts error-format:2 error-text:1 raw-error:2`,
  `forms/submit-service.ts error-format:2` (LOG-PORT: `{ error: cleanupError }` / `{ error }`), `media/tool-registrations.ts stored-error-text:1`,
  `widgets/html/resolve-html-page-embeds.ts console:1`, `widgets/read-service.ts console:1`, `widgets/resolver-service.ts console:15`.

**End state (coordinator, after all five batches are committed):** one cloud run of
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
    2. `context` = `key=value` for each of `logSource, source, operation, provider, method, path, runId, batchId,
       taskId, ownerRef, toolId, status, recoveryMessage` whose value is a string or finite number (a value with
       whitespace or `=` is JSON-quoted).
    3. Stored record, own try/catch: `buffer.append({ level: "error", source, message: \`[jini incident ${id}] ${context} ${formatErrorForLog({ error: incident.error }, TOVU_ERROR_REDACTION_OPTIONS)}\` })`
       (`TOVU_ERROR_REDACTION_OPTIONS` from `@tovu/contracts/secret-redaction`; the buffer redacts again and
       persists to the rotating site log when attached). D8: full text stored, never on the console.
    4. Console summary, own try/catch: `console.error(\`[jini] internal error (${context}, correlationId=${id})\`, describeErrorForLog({ err: incident.error }))`.
    5. Return `id`. Assignable to every one-argument `onInternalError` port.
  - `logJiniDiagnostic(record: LogDiagnosticRecord, { buffer, source }: same optional = {}): void` (the type from
    `@jini-ai/core`): stores `[jini ${record.level}] ${record.message}`, the meta as guarded `JSON.stringify`
    (failure -> `[meta unreadable]`, capped at 2,000 chars) and, when `record.error !== undefined`,
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
  console; hostile meta (throwing getter) stores `[meta unreadable]`. Source-text wiring test (style of
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
