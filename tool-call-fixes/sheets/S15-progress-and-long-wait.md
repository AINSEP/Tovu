# S15. Progress while a call waits; no hidden 300 s wall in the HTTP hop (C7, mechanism M9, Jini mcp)

Repo: Jini. Packages: `mcp` (+ one characterization test in `daemon`). Estimate: 200k Sonnet (+30k if step 0b proves the wall and change 3 builds the `node:http` adapter). Prerequisites: none.
Blocking decision: none.

## What progress does and does not do (judge finding 13)
There are three separate clocks. This sheet touches only the first.
| Clock | Owner | Today | This sheet |
|---|---|---|---|
| the CLI's own tool-call timeout | each agent CLI | unknown per CLI (S16a measures) | sends `notifications/progress` so a CLI that resets on progress keeps waiting |
| the tool's execution budget | `daemon/src/tool-executor.ts` | per tool | unchanged |
| the human-approval window | `core/src/approval.ts` `APPROVAL_WAIT_TIMEOUT_MS = 120_000`, armed in `tool-executor.ts` (`approval: ({ pending })`), once per call, "cannot replenish the execution budget" | 120 s | **unchanged and pinned**. A progress frame is a transport keepalive from the MCP host to the CLI; it never reaches the executor |
So progress cannot make a person's answer valid after 120 s. A card that expired stays expired. Changing the 120 s is
its own owner decision (OD-10), not part of this sheet.

## Read first
`../DESIGN.md` §2.9, M9. `rg -n "CallToolRequestSchema|extra|sendToolListChanged" packages/mcp/src/server/tool-server.ts` (409 lines) ·
`rg -n "function startDeadline|fetchImpl" packages/mcp/src/server/daemon-client.ts` · `rg -n "DEFAULT_DELEGATED_TOOL_TIMEOUT_MS" packages/mcp/src/server/tools/delegated-tool.ts` ·
`rg -n "fetchImpl" packages/mcp/src/bin/serve.ts` · `rg -n "APPROVAL_WAIT_TIMEOUT_MS|approvalWindowUsed" packages/daemon/src/tool-executor.ts` ·
the installed `@modelcontextprotocol/sdk` types for `RequestHandlerExtra` (`sendNotification`, `_meta.progressToken`). Read the SDK's docs for the installed version; do not rely on memory.

## Step 0a: pin the approval window (daemon characterization; passes today; commit first)
`daemon/src/__tests__/tool-executor.approval-window.characterization.test.ts` (fake timers, fake confirmer port):
1. a pending approval that nobody answers ends at 120 000 ms with today's status (record it) and the handler's effect count is 0.
2. a confirmation delivered at 120 001 ms has **zero** effects (handler not run, no second result).
3. cancellation while pending → zero effects.
4. the window is used once per call (`approvalWindowUsed`): pin what a second pending phase gets.

## Step 0b: prove or disprove the second wall (real local HTTP server, no fake fetch)
`daemon-client.long-wait.integration.test.ts`: a server that sends its response headers after D ms, called through
`postDaemonJson` with `timeoutMs: null` and a dispatcher whose header wait is 200 ms → pin today's failure text. Then
read the Node version in use and its documented default header wait, and write both in the report. If the default is
unlimited on the supported Node versions, drop change 3 and say so (README §4.14).

## Characterization (passes today)
`tool-server.progress.characterization.test.ts`, fake `McpServerLike`, fake scheduler: a `tools/call` with
`_meta: { progressToken: "t1" }` whose handler takes 120 fake seconds produces **zero** notifications.

## Red-first, `call-progress.unit.test.ts` (fake scheduler, fake `sendNotification`, fake logger)
1. token present, handler takes 120 s, interval 25 s → notifications at 25, 50, 75, 100 with exactly
   `{ progressToken: "t1", progress: 1..4, message: "waiting" }`, none after settle.
2. no token → none. 3. `extra.signal` aborts at 40 s → one notification, then none; the timer is cleared.
4. `sendNotification` rejects → the pump stops, the handler result is still returned, one log line through the logger port.
5. handler throws → pump stopped before the error result is returned.
6. a notification never contains tool output, arguments or ids (assert the exact object).
Wire test (`tool-server.wire.test.ts` style, real SDK server + in-memory transport): a slow local tool yields progress
frames for a client that sent a token, and no frame arrives after the response.

## Change (one gated commit per item)
1. `mcp/src/server/call-progress.ts` (new, ≤ 80 lines): `startCallProgress({ extra }, { scheduler, intervalMs = 25_000, logger })` → `{ stop() }`.
2. `tool-server.ts`: widen the handler's `extra` type with the two SDK fields; wrap the **top-level** `handleToolCall`
   await in `start` / `stop` with `try/finally`. At merge-final the handler is `createCallToolHandler` (438-line file;
   it moved there after merge-a); its nested `callLocalTool` also awaits `handleToolCall` and is **not** wrapped (one
   pump per CLI call). Net growth ≤ 8 lines. The scheduler and logger come from `McpToolServerOptions` (defaults: real timers, the host logger).
3. `bin/serve.ts`: build the run's `fetchImpl` with an unlimited response-header wait and pass it through
   `assembleRunToolHost`'s existing `fetchImpl` option. *(rev 3, Opus review B8)* An undici dispatcher is **not** an
   option: `packages/mcp/package.json` declares no `undici` (only `@jini-ai/core`, `protocol`, `platform`,
   `@cfworker/json-schema`, `@modelcontextprotocol/sdk`), `node:undici` does not exist, and Jini already records both
   facts (`agent-runtime/src/providers/connection-guard.ts:214,229`: global `fetch` uses undici's 300 000 ms
   `headersTimeout`; "`require('node:undici')` throws"). The no-new-dependency path is a small fetch-shaped adapter
   over `node:http` for the loopback daemon URL only (new `mcp/src/server/loopback-fetch.ts`, ≤ 80 lines, static
   `node:http` import, no timeout of its own: the caller's `AbortSignal` ends it), the same pattern as agent-runtime's
   `pinnedFetch`. If that adapter needs more than 80 lines or a header-wait test still fails, STOP and report; do not
   add a dependency.
   The limit on a delegated call stays the caller's signal; all other calls keep `DEFAULT_TIMEOUT_MS`.
4. Idle exit: confirm a waiting call counts as activity (`createActivityTracker`); add a test that a 20-minute wait does not trigger idle exit.

## Acceptance
All cases green; Step 0a's four tests still pass **unchanged** after the change (the proof that progress did not move
the approval window); cancellation still reaches the daemon (existing `ctx.signal` test); gate green for `mcp` and `daemon`.
