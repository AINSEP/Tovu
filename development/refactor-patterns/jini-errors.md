# Jini errors: the owner's error rule applied to a library

Status 2026-11-13, rev 5 (after review `review-d5r3`), DRAFT until the coordinator's re-review. Code on Jini
clone `jini-terra-d5` branch `design-d5` (rev 4: 76801d6ed, 74867d4cc, 3c06a063f, 9a2bcb954; rev 5: 5fcbb3ca1,
62fcaf2e0, f5a070fa4, 877b2624d, a4472d838). Terra prompt: `jini-errors.terra-prompt.md` (Part A Jini in five
batch jobs, Part B Tovu). Rev 3 (the 293-site plan) is kept at Tovu 9286dc3f5. Tovu counterpart:
`user-facing-errors.md`.

## 1. Rule (same as Tovu)
Plain words (what failed + what to do) + Copy details (error ID, step, versions, time); the incident is
recorded under the same ID; never a catch-all that drops the cause; never a generic "an internal error
occurred"; never secrets, tokens, cookies or bodies in a log. Not an incident: invalid input, untrusted payload
parse, expected refusals (not found, permission, storage/clipboard refusals, bad webhook signature).

## 2. Approach: safe shared pieces + a gate + a debt burn-down
Four reviews found the same class each time: a log line printed a caught error's text, which can quote untrusted
input or a credential no redaction pattern knows, and each hand-made row list missed rows. Rev 5 stops listing
by hand:
- **Safe shared pieces (done).** `describeErrorForLog` prints fixed words only (class labels from class checks,
  approved codes, never message/stack/constructor/own `name`, each field read once, never throws). Default sinks
  (`createConsoleLogger`, desktop-host file logger) project ALL metadata (`describeLogMeta` / `projectForLog`:
  depth 4, 50 entries, plain objects/arrays recurse, other objects `[object]`, every read guarded ->
  `[unreadable]`). The model proxy goes through `reportRouteInternalError`; an unknown provider is the fixed
  label `model-proxy/unknown` and still reaches the adapter's host sink. The settlement port is
  `warn({ message }, { error })`. Web-clone scripts use `lib/diagnostic-labels.mjs` (`errorClassLabel`,
  `assetId`, `hostLabel`): no raw URLs (userinfo/query secrets), no error text.
- **Log-safety gate (done).** `scripts/check-log-safety.mjs` (ESLint core rules, no plugin) finds raw log paths
  in production code: `console` outside the three sanctioned sinks, `error-text`, `error-format`, `raw-error`,
  `error-helper`, `stored-error-text`. `scripts/log-safety-debt.json` holds the allowed debt per file + rule
  (229 entries, 368 paths, 130 files: console 161, error-format 69, stored-error-text 61, error-helper 48,
  error-text 24, raw-error 5); the base-commit comparison refuses any growth. `--list` prints the work list.
- **Debt burn-down (Part A).** Five batch jobs (A1 route packs, A2 daemon runtime/core/hosts, A3 data/platform/
  plugins host, A4 agent plugins + runtime, A5 chat/UI/admin/CMS; 16-35 files each, disjoint packages, run in
  parallel). Each gate rule maps to one fix (describer, `Logger` error bag, host sink) or to KEEP (plain-words
  console, false positive) or not-this-lane (UI state, caller answers, thrown errors). Jobs write tests but run
  nothing; the coordinator regenerates the debt list once at the end, and the gate passes with the shrunk list.
- **Rows the gate cannot see stay explicit:** five helpers (webhook tick line, pglite socket, connections warn,
  OTel `errorType`, `describeTelemetryFailure`), json-ipc trace, diagnostics manifest, form notification,
  remaining web-clone rows, and the route packs (CN: one incident owner each, operation-specific message,
  `runId`/`taskId`/`toolId` carried to the host, xAI hands the ORIGINAL error to the host, no `redactError`).
Cost: a log alone no longer shows the message; the host record (section 3) does, under the same ID.
Known limit: a second loaded copy of core does not see another copy's registrations (built-in label; detail
lost, nothing added). The gate does not trace data flow through variables; jobs fix those by reading.

## 3. Host channel: Tovu's T1 (Part B)
`apps/website/src/platform/server-logs/jini-incident.ts`:
- `logJiniIncident(incident)`: ID = the incident's `correlationId` unchanged (what the user copied), else fresh.
  Full record (message + stack under Tovu's redaction) appended to the server log buffer (redacts again,
  persists to the site's rotating log when attached), with string/number context `logSource, source, operation,
  provider, method, path, runId, batchId, taskId, ownerRef, toolId, status, recoveryMessage`. Console: one
  metadata-only summary with the same ID. Each step contained; never throws.
- `logJiniDiagnostic(record)`: the `diagnostics` sink for Jini's default loggers; stores message, meta and
  error under Tovu's redaction; no console.
- Wired at every `onInternalError` Tovu passes Jini (12 places) plus 4 new: the outbox logger's `diagnostics`, the
  visitor frontend `session` AND `adapter` sinks, the bind-error callback through T1 (keeping
  `lostFrontendBindings.noteBindError`, dropping its raw console line), and the commerce worker adapter
  `warn({ message }, { error })`.
- T3: Electron main gets a redacting console (`installMainConsoleRedaction`).
Tests: response ID -> exactly one stored record through the real attachment, media and delegated-tool routes;
lifecycle `runId` correlation; throwing buffer still prints the summary; diagnostic sink stores, never prints.

## 4. Not this lane
- **Server-port plan:** Express contracts (`http-kit/src/adapter.ts`, `daemon/src/http/frontend-request-route.ts`)
  move to `core/contracts/server.ts`; xAI vendor configuration leaves daemon for its adapter (vendor-adapter
  rule). CN rows add no Express or vendor code.
- **Later lanes (rev 3, Tovu 9286dc3f5):** swallowed errors that gain a log (LS, RES-LS, MCP MR), cause handover
  (R, RS, memory), admin copy (U, incl. admin `stored-error-text` that is UI state), special sites (S, P, Q),
  comment-only drops (C), object-first error constructors (R-API, D7), chat's protocol dependency (D6), T4/T6.

## 5. Release order
1. Branch from Jini `refactor/terra`, merge `design-d5`.
2. Cloud gate red -> green on the pairs (section 6); Part A waits for every record (prompt P3).
3. Gate adoption on the merged base: `LOG_SAFETY_BASE_REF=<refactor/terra tip before the merge> node scripts/check-log-safety.mjs --update`,
   commit; CI step `log safety (blocking ratchet)` after `size (blocking ratchet)`, env like `SIZE_*`, runs
   `pnpm check:log-safety` (wired on refactor/terra's ci.yml, not d5's). Then `--list` -> per-batch work lists.
4. Part A: A1-A5 on Codex Terra in parallel (at most 6 at once). Per batch the coordinator commits test files
   first, sources second, by explicit paths. One batched reviewer for the round.
5. Cloud gate: red on each test commit, green on each source commit, per touched test file; no-emit tsc of every
   touched package; then one `check:log-safety --update`, committed; the gate must pass.
6. Jini release. Tovu bumps `@jini-ai/*` AND lands Part B in the same commit (otherwise `composeCommerce`'s
   string `warn` fails typecheck against the new worker port). Tests pinning custom class names from the
   describer (e.g. `SqliteError(...)`, now `Error(...)`) change there too.
7. Part B cloud gate, one reviewer.
Every function added or changed: at most 50 lines, cyclomatic and cognitive complexity at most 10 (admin 9/9),
args `(requiredObj, optionalObj = {})`; jobs skip rather than improvise.

## 6. Cloud gate red -> green list (nothing ran locally)
| Red (test-only) | Green (fix) | Test files |
|---|---|---|
| c88af7d03 | 76447baa5 | http-kit `internal-error`; daemon `tool-execution-rpc` |
| bf4043fce | c55eec038 | admin `describeApiError` |
| e4061b9de (898ec8a21's test file on e4061b9de sources) | ef09da3c3 / 898ec8a21 | core `primitives/defaults`, `integration-contract`; desktop-host `api-convention` |
| 74867d4cc + 3c06a063f | 9a2bcb954 | core `describe-error-for-log`, `model-facing-tool-errors`, `primitives/defaults`; desktop-host `logging`; daemon `tool-execution-rpc`; commerce `settlement-worker.unit` |
| 5fcbb3ca1 | 62fcaf2e0 | core `primitives/__tests__/defaults`; desktop-host `src/__tests__/logging`; daemon `src/http/__tests__/model-proxy`; commerce `settlement-worker.unit` (node:test); agent-runtime web-clone `mirror-site.unit`, `asset-harvest`, `diagnostic-labels.unit` |
| none (tests new code) | 877b2624d | root `scripts/__tests__/check-log-safety.test.ts` (green only) |
Plus no-emit tsc of core, desktop-host, http-kit, daemon, commerce, mcp. Unverified by any run: model-proxy
`reportRouteInternalError` inference + adapter sink assignability, `exactOptionalPropertyTypes` on optional
sinks, the gate test's relative filenames, esquery `:nth-child` argument positions.

## 7. Owner decisions
- **D8 Full text in Tovu's record: YES** (owner, 2026-11-13). Tovu's sink keeps the full message + stack under
  Tovu's redaction, in the log buffer/file only, never the console.
- D1 Host token shapes: Jini's own logs carry no error text; hosts inject sinks and redact their process console
  (T3). D2 comment-only for intentional drops (later lane). D3 visitor browser bundles: no console, no core
  import. D4 Jini UI local failures: inline refusal text only. D5 chat `persistUserTurn` failure: log only.
  D6/D7 in the later lane.
- Accepted cost: operator CLI scripts print the error class, not the message (a usage error keeps its own text).
