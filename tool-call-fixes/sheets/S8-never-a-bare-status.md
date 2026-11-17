# S8. The MCP client never prints a status alone, and never prints text the server did not write for the caller (C3, M5, client half)

Repo: Jini. Packages: `mcp` (uses `@jini-ai/core/errors/*`, already published). Estimate: 190k Sonnet.
Prerequisites: error-system E2 in the base (`rg -n "export function createErrorReporter" packages/core/src/errors/reporter.ts`
must hit; it does on `integ/merge-a-2026-11-16`, not on `merge-b`). No owner decision.

## Two rules (judge findings 4 and 19; lessons 24, 34)
1. **Disclosure.** Today the client shows only the fields of a recognized envelope. That stays. A body that is not a
   recognized envelope (HTML, plain text, invalid JSON, empty) is never quoted, not even its first line: it was not
   written for the caller and redaction is not permission. The model gets fixed words and a reference.
2. **One reporter.** The reference is minted and recorded by the host's error reporter (`createErrorReporter` in core),
   reached through one injected port. No second id format, no second log path.

## Read first
`../DESIGN.md` §2.5, M5. `rg -n "formatDaemonHttpError|parseJsonLoose|readJsonWithLimit|class DaemonHttpError|interface DaemonRequestOptions" packages/mcp/src/server/daemon-client.ts` ·
`rg -n "decodeApiError" packages/protocol/src/errors.ts` · `rg -n "export function daemonCallOptions|interface McpToolContext" packages/mcp/src/server/tool-protocol.ts` ·
`rg -n "function buildToolContext|interface McpToolServerOptions" packages/mcp/src/server/tool-server.ts` ·
`rg -n "assembleRunToolHost|RunToolHostOptions" packages/mcp/src/server/run-tool-host.ts` · `rg -n "assembleRunToolHost\(" packages/mcp/src/bin/serve.ts` ·
`rg -n "record\(required" packages/core/src/errors/reporter.ts` · `core/src/errors/testing.ts` (`createRecordingReporter`).

## Inventory step
`rg -n "DaemonHttpError" packages ../Tovu/apps ../Tovu/packages` and
`rg -n "HTTP \\\$\{|'HTTP |\"HTTP " packages ../Tovu/apps ../Tovu/packages ../Tovu/development`: every reader and every test
asserting a message that starts with `HTTP `. The form `HTTP <status>: <CODE>: <message>` for a **nested envelope
stays byte-identical** (old readers × new client).

## Characterization (passes today), `daemon-client.bare-status.characterization.test.ts`, fake `fetchImpl`
| Response | Message today |
|---|---|
| 500, `text/html`, an error page whose text contains `PRIVATE-CANARY draft of the owner's page` | `HTTP 500` |
| 404, `{"error":"a live run is required"}` | `HTTP 404` |
| 503, `{"error":"site scope is closed"}` | `HTTP 503` |
| 500, empty body | `HTTP 500` |
| 403, `{"error":{"code":"TOOL_OPERATION_DENIED","message":"x"}}` | `HTTP 403: TOOL_OPERATION_DENIED: x` |

## Red-first (fails: the first four rows are bare). Reporter fake returns `ERR-AAAA-BBBB-CCCC-DDDD`.
1. HTML 500 → exactly `The tool service failed (HTTP 500) and its answer was not readable. Reference: ERR-AAAA-BBBB-CCCC-DDDD. Do not retry the same call; give the user this reference.`
   The output does **not** contain `PRIVATE-CANARY` or any other word of the body.
2. flat 404 → `HTTP 404: a live run is required` (the flat `{ error: "<text>" }` shape is a recognized envelope:
   `decodeApiError` already reads it, and the server wrote that string for the caller). A flat `code` is included when present.
3. flat 503 → `The tool service is restarting or closed (HTTP 503): site scope is closed. Wait a few seconds and retry once.`
4. empty 500 → row 1's sentence, same reference rule. A 4xx without a readable envelope →
   `The tool service refused this call (HTTP <status>) and its answer was not readable. Reference: <ref>. Check the arguments; if they are right, give the user this reference.`
5. row 5 unchanged; a nested envelope with `requestId` appends ` Error ID: <requestId>.`; `DaemonHttpError` carries
   `code`, `requestId` and `details` (the envelope's `details` object when it is a plain JSON object under 4 KiB, else absent).
6. Canary property test: statuses 400 to 599 × bodies {empty, HTML, plain text, invalid JSON, 5 MB of `a`}, each body
   containing a random private sentence and a bearer token → the message never matches `/^HTTP \d{3}$/`, is at most
   400 characters, contains `Reference:`, and contains **no** 8-character substring of the body.
7. Reporting: for every unreadable answer the reporter fake received exactly **one** `record` call whose `step` is
   `mcp daemon call` and whose `error` is a `DaemonTransportFailure` carrying `status`, `route`, `contentType`,
   `bodyBytes` and **no** body text; the displayed reference equals the returned `errorId`. A nested or flat envelope
   produces **zero** `record` calls (the server already reported its own incident).
8. No reporter injected (other hosts, old callers): the sentence without the reference clause, still never a bare status:
   `The tool service failed (HTTP 500) and its answer was not readable. Do not retry the same call; tell the user the tool service failed.`

## Change (one gated commit per item)
1. New `mcp/src/server/daemon-error-text.ts` (pure, ≤ 150 lines): `describeDaemonFailure({ status, data, readable }, { reference })`
   → `{ message, code?, requestId?, details? }`. Uses `decodeApiError`; never stringifies an arbitrary object; never
   receives the raw body text (it gets `readable: boolean` only). Formatter leaves `daemon-client.ts`, with its doc comment.
2. `daemon-client.ts`: `DaemonHttpError` gains `code?`, `requestId?`, `details?`. `DaemonRequestOptions` gains
   `reportFailure?: (required: { error: unknown; step: string }) => { errorId: string }` (structurally
   `ErrorReporter['record']`). `requestDaemonJson` calls it once per unreadable answer. File ends under 300 lines.
3. Thread the port (judge finding 19), one line each, in this order so each commit compiles:
   `McpToolContext.reportFailure?` + `daemonCallOptions` forwards it → `McpToolServerOptions.reportFailure?` +
   `buildToolContext` copies it → `RunToolHostOptions.reportFailure?` + `assembleRunToolHost` passes it →
   `bin/serve.ts` builds the reporter.
4. `bin/serve.ts` (253 lines; composition root): `createErrorReporter({ ids, clock, logger, tracker, catalog, versions })`
   with ids = `mintToolErrorId({ randomHex })` from `@jini-ai/core/errors/error-id` over `node:crypto` `randomBytes`,
   logger = the process's stderr logger, tracker = a no-op (`reportError() {}`; this stdio process has no tracker, say
   so in a comment), catalog = an empty `createErrorCatalog`, versions from the package manifest. All static imports.
   `ServeDeps` accepts a `reportFailure` override for tests.

## Assembled-host test (not only direct client calls)
`run-tool-host.report-failure.integration.test.ts`: `assembleRunToolHost` with a fake `fetchImpl` that answers an HTML
500 to a delegated call and a recording reporter (`createRecordingReporter`) → the MCP `tools/call` result text
contains the reference, and the reporter holds exactly one record with that id.

## Acceptance
All rows green with exact text; `daemon-client.test.ts` count not lower; Tovu consumers from the inventory pass
unchanged against the linked build or are listed with the exact line that changed and why; gate green.
