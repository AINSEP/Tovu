# Jini errors: the owner's error rule applied to a library

Status 2026-11-13, rev 4 (after re-review `review-d5r2`). The shared log pieces are fixed at the root on Jini
clone `jini-terra-d5` branch `design-d5` (76801d6ed, 74867d4cc, 3c06a063f, 9a2bcb954). What is left is one small
lane: 79 raw log paths moved onto those pieces. Terra prompt: `jini-errors.terra-prompt.md` (Part A Jini,
Part B Tovu). Rev 3 (the 293-site plan) is kept at Tovu 9286dc3f5. Tovu counterpart: `user-facing-errors.md`.

## 1. Rule (same as Tovu)
Plain words (what failed + what to do) + Copy details (error ID, step, versions, time); the incident is
recorded under the same ID; never a catch-all that drops the cause; never a generic "an internal error
occurred"; never secrets, tokens, cookies or bodies in a log. Not an incident: invalid input, untrusted payload
parse, expected refusals (not found, permission, storage/clipboard refusals, bad webhook signature).

## 2. Safe by construction (rev 4)
Three reviews found the same class each time: a log line printed a caught error's text, and that text could
quote untrusted input or a credential no redaction pattern knows. Rev 1 to 3 patched rows; each review found
rows nobody had re-checked. Rev 4 removes the choice instead:
- **`describeErrorForLog` can only print fixed words.** Labels come from class checks (built-in classes,
  `ToolInputError`, classes a package registers, `AbortError`/`TimeoutError` by exact name); a `code` prints only
  if it is in `LOGGABLE_ERROR_CODES` (extended by `registerLoggableErrors`). It never prints a message, stack,
  constructor name or the value's own `name`, reads each field once, and never throws.
- **Default sinks are metadata-only.** `createConsoleLogger` and the desktop-host file logger print the words the
  caller wrote plus describer output for `error`, `reason` and any Error-valued meta.
- **Full detail only goes to the host.** The route owner `reportRouteInternalError` hands the injected
  `onInternalError` sink the original error, the route's fields (`runId`, ...), `correlationId` and `logSource`;
  the settlement port gets `warn(message, { error })`; a host `Logger` gets the error in its error bag; both
  default loggers take an optional `diagnostics` host sink that receives every call unchanged. The host owns
  policy and redaction for that channel.
- Self-contained bundles (agent-plugin `.mjs`, skill scripts, memory) use one local `errorClassLabel`
  (class checks only), never `.name`.
Cost: a log alone no longer shows the message; the host record (section 3) does, under the same ID.
Known limit: a second loaded copy of core does not see another copy's registrations (falls back to the
built-in label; detail lost, nothing added).

## 3. Tovu's side: T1 `logJiniIncident`
`apps/website/src/platform/server-logs/jini-incident.ts`, wired at every `onInternalError` Tovu passes to Jini
(12 places, listed in the prompt) and commerce's default `warn`:
- ID = the incident's `correlationId` unchanged (what the user copied), else a fresh one (lifecycle incidents).
- Full record (message + stack, Tovu's redaction policy) appended to Tovu's server log buffer, which redacts
  again and persists to the site's rotating log file when attached. `logSource`, `source`, `operation`,
  `provider`, `method`, `path`, `runId`, `batchId` are kept as `key=value`.
- Console: one metadata-only summary line with the same ID. Each step in its own try/catch; never throws.
- T3: Electron main gets a redacting console (`installMainConsoleRedaction`). In Electron main the record lands
  in the process buffer unless a log file is attached there (Part B reports which).
Tests: response ID -> exactly one stored record with the detail and no secret; lifecycle `runId` correlation;
a throwing buffer still prints the summary.

## 4. The lane: 79 rows (prompt section 5)
| Group | Rows | What changes |
|---|---|---|
| 5a existing full-text log lines | 49 | the formatting expression becomes `describeErrorForLog`; port calls move the error to the `Logger` bag |
| 5b helper-built diagnostics | 7 | webhook tick line, pglite socket, connections warn, OTel `errorType`, `describeTelemetryFailure` |
| 5c form notification | 1 | provider refusal text leaves the message; it travels as an error object to the host logger |
| 5d web-clone CLI scripts | 8 | `errorClassLabel` (LB) in a new `lib/error-label.mjs` |
| 5e route packs (CN) | 14 | each pack's own default sink goes; one owner, operation-specific message, no generic text |
Plus 5f, run first: a search for raw paths nobody listed (helpers, callbacks, intermediate strings); each hit is
fixed or listed as not-this-lane with a reason. Each changed source file gets red, green, mutation-red.

## 5. Moved out of this lane
- **Later lane (rev 3 rows, Tovu 9286dc3f5):** swallowed errors that gain a log (LS 41, RES-LS 15, MCP MR 3),
  cause handover (R 5, RS 6, memory 2), admin copy (U 8), special sites (S 3, P 1, Q 4), comment-only drops
  (C 145), object-first error constructors (R-API, D7), chat's protocol dependency (D6), Part B T4/T6. None is
  the leak class now: no default sink prints a cause's text, so RS needs no separate secret judgement.
- **Server-port plan:** Express contracts in daemon/http-kit (`frontend-request-route.ts`, `adapter.ts`) move to
  `core/contracts/server.ts`; xAI vendor behaviour leaves daemon for its adapter (vendor-adapter rule). The CN
  rows only replace the packs' sinks and messages; they add no Express or vendor code.

## 6. Release sequence
1. P1 base: branch from Jini `refactor/terra` with `design-d5` merged.
2. Cloud gate, red then green, per test-only commit (owner's failing-test-first rule; this machine runs no
   tests): run the test file on the test-only revision and record the failing assertion, then on the fix and
   record the pass. Pairs: c88af7d03 -> 76447baa5 (route owner); bf4043fce -> c55eec038 (admin
   `describeApiError`); e4061b9de -> ef09da3c3 (metadata-only default; 898ec8a21's test file runs on
   e4061b9de sources for red, at 898ec8a21 for green); 74867d4cc + 3c06a063f -> 9a2bcb954 (root fix). Files: core
   `describe-error-for-log`, `model-facing-tool-errors`, `primitives/defaults`, `integration-contract`;
   desktop-host `logging`, `api-convention`; http-kit `internal-error`; daemon `tool-execution-rpc`; commerce
   `settlement-worker.unit`; plus no-emit tsc of core, desktop-host, http-kit, commerce, daemon, mcp. Part A does
   not start until every pair has both records (prompt P3).
3. Part A on Codex Terra (Jini), one reviewer, commit, cloud gate on every touched test file.
4. Jini release; Tovu bumps `@jini-ai/*`. Tovu tests that pin custom class names from `describeErrorForLog`
   (e.g. `SqliteError(...)`, now `Error(...)`) change in Part B.
5. Part B on Codex Terra (Tovu): T1, T3. One reviewer, commit, cloud gate.

Every function added or changed: at most 50 lines, cyclomatic and cognitive complexity at most 10 (admin 9/9),
args `(requiredObj, optionalObj = {})`. No helper beyond the listed safe pieces.

## 7. Owner decisions (defaults applied; say if you want otherwise)
- **D8 Full text in Tovu's record.** Design assumes yes: Tovu's sink keeps the full message + stack under Tovu's
  redaction, in the log buffer/file only, never the console. Alternative: Tovu's record is metadata-only too
  (debugging then needs a reproduction).
- D1 Host token shapes: Jini's own logs carry no error text, so host shapes cannot reach them; hosts inject
  sinks and still redact their process console (T3). Alternative: a host pattern list in core (global state).
- D2 Comment-only for intentional drops (later lane). D3 Visitor browser bundles: no console logging, no core
  import. D4 Jini UI local failures: inline refusal text only. D5 chat `persistUserTurn` failure: log only; a
  user notice needs its own design.
- D6 chat takes `@jini-ai/protocol` as a hard dependency; D7 `PluginInstallError` object-first (~17 Tovu
  callers). Both in the later lane.
- Accepted cost of 5d: operator CLI scripts print the error class, not the message (a missing file reads as
  `Error`). Alternative: an explicit `--verbose` flag that prints the full text to the operator's own terminal.
